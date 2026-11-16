//! Watchlist discovery: typed summary and item reads with private cursors.
//!
//! Web and MCP adapters build a transport-neutral [`DiscoveryRequest`], call
//! the typed operation owned by the matching submodule, and project the typed
//! result for their own protocol. Selection, ordering, search, page sizes and
//! cursor binding live here; neither adapter re-implements them.

mod items;
mod summary;

pub use items::{GroupedTitle, ItemPage, ItemResults};
pub use summary::SummaryPage;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::{Value, json};

/// A discovery operation shared by web and MCP.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DiscoveryOperation {
    List,
    Search,
    Get,
    Find,
}

impl DiscoveryOperation {
    /// Whether this operation reads watchlist summaries rather than items.
    pub fn is_summary(self) -> bool {
        matches!(self, Self::List | Self::Search)
    }
}

/// Discovery arguments after adapter-owned transport normalization.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DiscoveryRequest {
    pub query: Option<String>,
    pub order_by: Option<String>,
    pub order: Option<String>,
    pub page_size: Option<i64>,
    pub cursor: Option<String>,
    pub watchlist_id: Option<i64>,
    pub watchlist_item_id: Option<i64>,
    pub provider: Option<String>,
    pub provider_id: Option<String>,
    pub media_type: Option<String>,
    pub result_view: Option<String>,
}

/// A user-facing discovery failure.
#[derive(Debug)]
pub enum DiscoveryError {
    InvalidInput(String),
    Database(sea_orm::DbErr),
}

impl From<String> for DiscoveryError {
    fn from(message: String) -> Self {
        Self::InvalidInput(message)
    }
}

impl std::fmt::Display for DiscoveryError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput(message) => formatter.write_str(message),
            Self::Database(error) => write!(formatter, "{error}"),
        }
    }
}

/// A validated page window, shared by summary and item discovery.
#[derive(Clone, Debug)]
pub(super) struct Page {
    size: usize,
    cursor: Option<String>,
}

impl Page {
    pub(super) const DEFAULT_SIZE: usize = 50;
    pub(super) const MAX_SIZE: usize = 100;

    /// Validates page size and keeps the opaque cursor for decoding.
    pub(super) fn new(
        page_size: Option<i64>,
        cursor: Option<String>,
    ) -> Result<Self, DiscoveryError> {
        let size = page_size
            .map(|size| {
                usize::try_from(size)
                    .ok()
                    .filter(|size| (1..=Self::MAX_SIZE).contains(size))
                    .ok_or_else(|| invalid("Invalid pageSize."))
            })
            .transpose()?
            .unwrap_or(Self::DEFAULT_SIZE);
        Ok(Self { size, cursor })
    }

    pub(super) fn size(&self) -> usize {
        self.size
    }
}

/// The values a cursor is bound to, private to discovery.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum CursorBinding {
    Summaries {
        order_by: &'static str,
        order: &'static str,
        search: Option<String>,
    },
    Items {
        watchlist_id: i64,
        page_size: usize,
        query: Option<String>,
        titles: bool,
    },
}

impl CursorBinding {
    /// The binding's stable JSON shape, kept compatible with v1 cursors.
    fn value(&self) -> Value {
        match self {
            Self::Summaries {
                order_by,
                order,
                search,
            } => {
                let mut value = json!({"orderBy": order_by, "order": order});
                if let Some(search) = search {
                    value["searchQuery"] = json!(search);
                }
                value
            }
            Self::Items {
                watchlist_id,
                page_size,
                query,
                titles,
            } => {
                let mut value = json!({"watchlistId": watchlist_id, "pageSize": page_size});
                if let Some(query) = query {
                    value["query"] = json!(query);
                }
                if *titles {
                    value["resultView"] = json!("titles");
                }
                value
            }
        }
    }
}

/// Returns one page of already ordered values plus the continuation cursor.
pub(super) fn paginate<T>(
    values: Vec<T>,
    page: &Page,
    binding: &CursorBinding,
) -> Result<(Vec<T>, Option<String>), DiscoveryError> {
    let offset = match &page.cursor {
        Some(cursor) => offset(cursor, binding)?,
        None => 0,
    };
    let has_more = values.len().saturating_sub(offset) > page.size;
    let page_values = values
        .into_iter()
        .skip(offset)
        .take(page.size)
        .collect::<Vec<_>>();
    let next = has_more
        .then(|| encode(binding, offset.saturating_add(page.size)))
        .transpose()?;
    Ok((page_values, next))
}

fn offset(cursor: &str, binding: &CursorBinding) -> Result<usize, DiscoveryError> {
    let decoded = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| invalid("Invalid cursor."))?;
    let mut cursor: Value =
        serde_json::from_slice(&decoded).map_err(|_| invalid("Invalid cursor."))?;
    let offset = cursor
        .get("offset")
        .and_then(Value::as_u64)
        .and_then(|offset| usize::try_from(offset).ok())
        .ok_or_else(|| invalid("Invalid cursor."))?;
    let object = cursor
        .as_object_mut()
        .ok_or_else(|| invalid("Invalid cursor."))?;
    object.remove("offset");
    if cursor != binding.value() {
        return Err(invalid("Invalid cursor."));
    }
    Ok(offset)
}

fn encode(binding: &CursorBinding, offset: usize) -> Result<String, DiscoveryError> {
    let mut cursor = binding.value();
    cursor["offset"] = json!(offset);
    let bytes = serde_json::to_vec(&cursor).map_err(|_| invalid("Invalid cursor."))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub(super) fn invalid(message: impl Into<String>) -> DiscoveryError {
    DiscoveryError::InvalidInput(message.into())
}

/// Trims required free text and rejects an empty value after trimming.
pub(super) fn trimmed_text(
    value: Option<String>,
    key: &str,
) -> Result<Option<String>, DiscoveryError> {
    value
        .map(|text| {
            let text = text.trim().to_owned();
            if text.is_empty() {
                Err(invalid(format!("Invalid {key}.")))
            } else {
                Ok(text)
            }
        })
        .transpose()
}

/// Validates a positive stored identifier.
pub(super) fn positive_id(value: Option<i64>, key: &str) -> Result<Option<i64>, DiscoveryError> {
    value
        .map(|id| {
            if id > 0 {
                Ok(id)
            } else {
                Err(invalid(format!("Invalid {key}.")))
            }
        })
        .transpose()
}
