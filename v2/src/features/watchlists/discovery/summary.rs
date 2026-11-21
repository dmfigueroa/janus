//! Summary discovery: watchlist ordering, Unicode name search and summary pages.

use super::{
    CursorBinding, DiscoveryError, DiscoveryOperation, DiscoveryRequest, Page, encode, invalid,
    trimmed_text,
};
use crate::features::watchlists::{WatchlistRecord, WatchlistSummary, Watchlists};
use unicode_normalization::UnicodeNormalization;

/// One page of typed watchlist summaries, ready for an adapter.
#[derive(Clone, Debug, PartialEq)]
pub struct SummaryPage {
    pub watchlists: Vec<WatchlistSummary>,
    pub next_cursor: Option<String>,
}

/// A validated summary request, after transport-level normalization.
struct SummaryQuery {
    /// The folded search text used for matching and cursor binding.
    search: Option<String>,
    order_by: SummaryOrderBy,
    order: SortOrder,
    page: Page,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SummaryOrderBy {
    CreatedAt,
    LastWatched,
    LastAdded,
}

impl SummaryOrderBy {
    fn parse(value: Option<&str>) -> Result<Self, DiscoveryError> {
        match value.unwrap_or("createdAt") {
            "createdAt" => Ok(Self::CreatedAt),
            "lastWatched" => Ok(Self::LastWatched),
            "lastAdded" => Ok(Self::LastAdded),
            _ => Err(invalid("Invalid orderBy.")),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::CreatedAt => "createdAt",
            Self::LastWatched => "lastWatched",
            Self::LastAdded => "lastAdded",
        }
    }

    fn value(self, list: &WatchlistRecord) -> Option<&str> {
        match self {
            Self::CreatedAt => Some(list.created_at.as_str()),
            Self::LastWatched => list.last_watched_at.as_deref(),
            Self::LastAdded => Some(
                list.last_item_added_at
                    .as_deref()
                    .unwrap_or(list.created_at.as_str()),
            ),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SortOrder {
    Asc,
    Desc,
}

impl SortOrder {
    fn parse(value: Option<&str>) -> Result<Self, DiscoveryError> {
        match value.unwrap_or("desc") {
            "asc" => Ok(Self::Asc),
            "desc" => Ok(Self::Desc),
            _ => Err(invalid("Invalid order.")),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        }
    }
}

impl SummaryQuery {
    fn validate(
        operation: DiscoveryOperation,
        request: DiscoveryRequest,
    ) -> Result<Self, DiscoveryError> {
        if !operation.is_summary() {
            return Err(invalid("Invalid discovery operation."));
        }
        let order_by = SummaryOrderBy::parse(request.order_by.as_deref())?;
        let order = SortOrder::parse(request.order.as_deref())?;
        let page = Page::new(request.page_size, request.cursor)?;
        let query = trimmed_text(request.query, "query")?;
        let search = if operation == DiscoveryOperation::Search {
            let query = query
                .as_deref()
                .ok_or_else(|| invalid("A search query is required."))?;
            Some(folded(query))
        } else {
            None
        };
        Ok(Self {
            search,
            order_by,
            order,
            page,
        })
    }
}

impl Watchlists {
    /// Typed summary discovery for callers that own their protocol projection.
    ///
    /// # Errors
    ///
    /// Returns [`DiscoveryError`] for invalid input or a failed database read.
    pub async fn summaries(
        &self,
        operation: DiscoveryOperation,
        request: DiscoveryRequest,
    ) -> Result<SummaryPage, DiscoveryError> {
        let query = SummaryQuery::validate(operation, request)?;
        self.summary_page(query).await
    }

    async fn summary_page(&self, query: SummaryQuery) -> Result<SummaryPage, DiscoveryError> {
        let binding = CursorBinding::Summaries {
            order_by: query.order_by.as_str(),
            order: query.order.as_str(),
            search: query.search.clone(),
        };
        let offset = query.page.offset(&binding)?;
        let page_size = query.page.size();
        let (watchlists, eligible_count) = self
            .summaries_for(|headers| {
                let mut eligible = headers
                    .iter()
                    .filter(|list| {
                        query
                            .search
                            .as_ref()
                            .is_none_or(|search| folded(&list.name).contains(search))
                    })
                    .collect::<Vec<_>>();
                eligible.sort_by(|left, right| {
                    let compared = query
                        .order_by
                        .value(left)
                        .cmp(&query.order_by.value(right))
                        .then_with(|| left.id.cmp(&right.id));
                    if query.order == SortOrder::Desc {
                        compared.reverse()
                    } else {
                        compared
                    }
                });
                let ids = eligible
                    .iter()
                    .skip(offset)
                    .take(page_size)
                    .map(|list| list.id)
                    .collect::<Vec<_>>();
                (ids, eligible.len())
            })
            .await
            .map_err(DiscoveryError::Database)?;
        let next_cursor = (eligible_count.saturating_sub(offset) > page_size)
            .then(|| encode(&binding, offset.saturating_add(page_size)))
            .transpose()?;
        Ok(SummaryPage {
            watchlists,
            next_cursor,
        })
    }
}

pub(crate) fn folded(value: &str) -> String {
    value.nfc().collect::<String>().to_lowercase()
}
