//! Watchlist discovery: cursor pagination, ordering, search and item lookup.
//! Typed results feed adapters; JSON is produced at the protocol boundary.

use super::{WatchlistItem, WatchlistRecord, WatchlistStats, WatchlistSummary, Watchlists};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use unicode_normalization::UnicodeNormalization;

/// Full stored-item projection used by detail stats.
fn item_json(item: &WatchlistItem) -> Value {
    json!({
        "id": item.id,
        "tmdbId": item.tmdb_id,
        "source": item.source,
        "mediaType": item.media_type,
        "title": item.title,
        "parentId": item.parent_id,
        "parentTitle": item.parent_title,
        "episode": item.episode,
        "posterPath": item.poster_path,
        "releaseDate": item.release_date,
        "addedAt": item.added_at,
        "watchlistId": item.watchlist_id,
        "season": item.season,
        "runtime": item.runtime,
        "customRank": item.custom_rank,
        "voteAverage": item.vote_average,
        "isWatched": item.is_watched,
        "authors": item.authors,
    })
}

/// Reduced item projection returned by regular MCP item views.
fn item_projection(item: &WatchlistItem) -> Value {
    json!({
        "id": item.id,
        "watchlistId": item.watchlist_id,
        "provider": item.source,
        "providerId": item.tmdb_id,
        "mediaType": item.media_type,
        "title": item.title,
        "parent": {"providerId": item.parent_id, "title": item.parent_title},
        "episode": item.episode,
        "isWatched": item.is_watched,
    })
}

fn record_json(record: &WatchlistRecord) -> Value {
    json!({
        "id": record.id,
        "name": record.name,
        "description": record.description,
        "itemOrderMode": record.item_order_mode.as_str(),
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
        "lastWatchedAt": record.last_watched_at,
        "lastItemAddedAt": record.last_item_added_at,
        "pausedAt": record.paused_at,
    })
}

fn stats_json(stats: &WatchlistStats) -> Value {
    json!({
        "totalItems": stats.total_items,
        "watchedItems": stats.watched_items,
        "progress": stats.progress,
        "nextUnwatched": stats.next_unwatched.as_ref().map(item_json),
        "coverImage": stats.cover_image,
        "coverMediaType": stats.cover_media_type,
    })
}

fn summary_json(summary: &WatchlistSummary) -> Value {
    let mut value = record_json(&summary.watchlist);
    value["stats"] = stats_json(&summary.stats);
    value
}

fn invalid(message: &str) -> String {
    message.into()
}
fn request_arguments(request: DiscoveryRequest) -> Result<Value, DiscoveryError> {
    serde_json::to_value(request).map_err(|error| invalid(&error.to_string()).into())
}
fn offset(arguments: &Value, binding: &Value) -> Result<usize, String> {
    let Some(cursor) = arguments.get("cursor") else {
        return Ok(0);
    };
    let decoded = URL_SAFE_NO_PAD
        .decode(cursor.as_str().ok_or_else(|| invalid("Invalid cursor."))?)
        .map_err(|_| invalid("Invalid cursor."))?;
    let cursor: Value = serde_json::from_slice(&decoded).map_err(|_| invalid("Invalid cursor."))?;
    let mut cursor_binding = cursor.clone();
    let Some(object) = cursor_binding.as_object_mut() else {
        return Err(invalid("Invalid cursor."));
    };
    object.remove("offset");
    if cursor_binding != *binding {
        return Err(invalid("Invalid cursor."));
    }
    cursor["offset"]
        .as_u64()
        .and_then(|offset| usize::try_from(offset).ok())
        .ok_or_else(|| invalid("Invalid cursor."))
}
fn paginate<T>(
    values: Vec<T>,
    arguments: &Value,
    binding: Value,
) -> Result<(Vec<T>, Option<String>), String> {
    let size = arguments["pageSize"].as_u64().unwrap_or(50) as usize;
    let offset = offset(arguments, &binding)?;
    let has_more = values.len().saturating_sub(offset) > size;
    let page: Vec<T> = values.into_iter().skip(offset).take(size).collect();
    let cursor = if has_more {
        let mut cursor = binding;
        cursor["offset"] = json!(offset + size);
        Some(
            URL_SAFE_NO_PAD
                .encode(serde_json::to_vec(&cursor).map_err(|_| invalid("Invalid cursor."))?),
        )
    } else {
        None
    };
    Ok((page, cursor))
}
fn with_cursor(mut value: Value, cursor: Option<String>) -> Value {
    if let Some(cursor) = cursor {
        value["nextCursor"] = json!(cursor);
    }
    value
}
fn size(arguments: &Value) -> Value {
    arguments
        .get("pageSize")
        .cloned()
        .unwrap_or_else(|| json!(50))
}
fn folded(value: &str) -> String {
    value.nfc().collect::<String>().to_lowercase()
}
fn title_json(
    provider: &str,
    provider_id: &str,
    media_type: &str,
    title: &str,
    matching_item_count: usize,
) -> Value {
    json!({"provider":provider,"providerId":provider_id,"mediaType":media_type,"title":title,"matchingItemCount":matching_item_count})
}
fn titles(items: &[&WatchlistItem]) -> Vec<Value> {
    // Keys borrow from `items`, which outlives the grouping map.
    let mut grouped = BTreeMap::<(&str, &str, &str, &str), usize>::new();
    for item in items {
        let (id, title) = item.group_title();
        *grouped
            .entry((title, id, &item.source, &item.media_type))
            .or_default() += 1;
    }
    grouped
        .into_iter()
        .map(|((title, id, source, media), count)| title_json(source, id, media, title, count))
        .collect()
}
fn title(item: &WatchlistItem) -> Value {
    let (id, title) = item.group_title();
    title_json(&item.source, id, &item.media_type, title, 1)
}
/// The discovery operations shared by web and MCP.
fn sort_value<'a>(list: &'a WatchlistRecord, order_by: &str) -> Option<&'a str> {
    match order_by {
        "lastWatched" => list.last_watched_at.as_deref(),
        "lastAdded" => list
            .last_item_added_at
            .as_deref()
            .or(Some(list.created_at.as_str())),
        _ => Some(list.created_at.as_str()),
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DiscoveryOperation {
    List,
    Search,
    Get,
    Find,
}

/// Discovery arguments after transport-level normalization.
#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watchlist_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watchlist_item_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_view: Option<String>,
}

/// One page of typed watchlist summaries, ready for an adapter.
#[derive(Clone, Debug, PartialEq)]
pub struct SummaryPage {
    pub watchlists: Vec<WatchlistSummary>,
    pub next_cursor: Option<String>,
}

/// User-facing discovery failure.
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
impl Watchlists {
    /// Runs a discovery operation and returns its MCP-compatible JSON envelope.
    ///
    /// # Errors
    ///
    /// Returns [`DiscoveryError`] for invalid input, missing watchlists or a
    /// failed database read.
    pub async fn discovery(
        &self,
        operation: DiscoveryOperation,
        request: DiscoveryRequest,
    ) -> Result<Value, DiscoveryError> {
        self.discover_arguments(operation, request_arguments(request)?)
            .await
    }
    /// Typed summary discovery for adapters that do not speak MCP JSON.
    ///
    /// # Errors
    ///
    /// Returns [`DiscoveryError`] for invalid input or a failed database read.
    pub async fn summaries(
        &self,
        operation: DiscoveryOperation,
        request: DiscoveryRequest,
    ) -> Result<SummaryPage, DiscoveryError> {
        if !matches!(
            operation,
            DiscoveryOperation::List | DiscoveryOperation::Search
        ) {
            return Err(invalid("Invalid discovery operation.").into());
        }
        let arguments = super::validation::arguments(operation, request_arguments(request)?)?;
        self.summary_page(operation, arguments).await
    }
    pub(super) async fn discover_arguments(
        &self,
        operation: DiscoveryOperation,
        arguments: Value,
    ) -> Result<Value, DiscoveryError> {
        let arguments = super::validation::arguments(operation, arguments)?;
        if matches!(
            operation,
            DiscoveryOperation::List | DiscoveryOperation::Search
        ) {
            let page = self.summary_page(operation, arguments).await?;
            return Ok(with_cursor(
                json!({"watchlists": page.watchlists.iter().map(summary_json).collect::<Vec<_>>()}),
                page.next_cursor,
            ));
        }
        let Some(id) = arguments["watchlistId"].as_i64() else {
            return Err(invalid("Invalid watchlist ID.").into());
        };
        let data = self.detail(id).await.map_err(DiscoveryError::Database)?;
        let view = arguments["resultView"].as_str().unwrap_or("items");
        let Some(data) = data else {
            if operation == DiscoveryOperation::Find
                && (arguments.get("watchlistItemId").is_some()
                    || arguments.get("provider").is_some())
            {
                return Ok(json!({view:[]}));
            }
            return Err(invalid(&format!("Watchlist {id} was not found.")).into());
        };
        let mut selected: Vec<&WatchlistItem> = data.items.iter().collect();
        let mut exact = false;
        if operation == DiscoveryOperation::Find {
            let selectors = [
                arguments.get("watchlistItemId").is_some(),
                arguments.get("provider").is_some()
                    || arguments.get("providerId").is_some()
                    || arguments.get("mediaType").is_some(),
                arguments.get("query").is_some(),
            ];
            if selectors[0] {
                let Some(target) = arguments["watchlistItemId"].as_i64() else {
                    return Err(invalid("Invalid watchlist item ID.").into());
                };
                selected.retain(|item| item.id == target);
                exact = true;
            } else if selectors[1] {
                let provider = arguments["provider"].as_str().map(str::trim);
                let provider_id = arguments["providerId"].as_str().map(str::trim);
                let media_type = arguments["mediaType"].as_str();
                selected.retain(|item| {
                    provider == Some(item.source.as_str())
                        && provider_id == Some(item.tmdb_id.as_str())
                        && media_type == Some(item.media_type.as_str())
                });
                exact = true;
            } else {
                let Some(query) = arguments["query"].as_str() else {
                    return Err(invalid("A search query is required.").into());
                };
                let query = query.trim().to_ascii_lowercase();
                selected.retain(|item| item.matches_text(&query));
            }
        }
        let values = if view == "titles" {
            if exact {
                selected.iter().map(|item| title(item)).collect()
            } else {
                titles(&selected)
            }
        } else {
            selected.iter().map(|item| item_projection(item)).collect()
        };
        let mut result = if exact {
            json!({view: values})
        } else {
            let mut binding = json!({"watchlistId":id,"pageSize":size(&arguments)});
            if let Some(query) = arguments.get("query") {
                binding["query"] = json!(query.as_str().unwrap_or("").trim());
            }
            if view == "titles" {
                binding["resultView"] = json!("titles");
            }
            let (values, cursor) = paginate(values, &arguments, binding)?;
            with_cursor(json!({view: values}), cursor)
        };
        if operation == DiscoveryOperation::Get {
            result["watchlist"] = summary_json(&data.watchlist);
            if view == "items" {
                result["orderToken"] = json!(data.order_token);
            }
        }
        Ok(result)
    }
    async fn summary_page(
        &self,
        operation: DiscoveryOperation,
        arguments: Value,
    ) -> Result<SummaryPage, DiscoveryError> {
        let order_by = arguments["orderBy"].as_str().unwrap_or("createdAt");
        let order = arguments["order"].as_str().unwrap_or("desc");
        let query = if operation == DiscoveryOperation::Search {
            let Some(query) = arguments["query"].as_str() else {
                return Err(invalid("A search query is required.").into());
            };
            Some(folded(query.trim()))
        } else {
            None
        };
        let mut headers: Vec<WatchlistRecord> =
            self.headers().await.map_err(DiscoveryError::Database)?;
        headers.retain(|list| {
            query
                .as_ref()
                .is_none_or(|query| folded(&list.name).contains(query))
        });
        headers.sort_by(|left, right| {
            let compared = sort_value(left, order_by)
                .cmp(&sort_value(right, order_by))
                .then_with(|| left.id.cmp(&right.id));
            if order == "desc" {
                compared.reverse()
            } else {
                compared
            }
        });
        let mut binding = json!({"orderBy":order_by,"order":order});
        if let Some(query) = query {
            binding["searchQuery"] = json!(query);
        }
        let (headers, next_cursor) = paginate(headers, &arguments, binding)?;
        let mut watchlists = Vec::new();
        for header in headers {
            if let Some(summary) = self
                .summary(header.id)
                .await
                .map_err(DiscoveryError::Database)?
            {
                watchlists.push(summary);
            }
        }
        Ok(SummaryPage {
            watchlists,
            next_cursor,
        })
    }
}
