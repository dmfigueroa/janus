//! MCP adapter: legacy argument normalization and protocol JSON projections.
//!
//! Discovery behavior lives in [`super::discovery`]; this adapter owns only the
//! legacy coercion, unknown-field handling and JSON envelopes v1 exposed.

use super::{
    Watchlists,
    discovery::{
        DiscoveryError, DiscoveryOperation, DiscoveryRequest, GroupedTitle, ItemPage, ItemResults,
        SummaryPage,
    },
};
use rmcp::{ErrorData, RoleServer, ServerHandler, model::*, service::RequestContext};
use serde_json::{Value, json};

#[derive(Clone)]
pub struct ReadMcp(pub Watchlists);

fn object_schema(properties: Value, required: Value) -> serde_json::Map<String, Value> {
    serde_json::Map::from_iter([
        ("type".into(), json!("object")),
        ("properties".into(), properties),
        ("required".into(), required),
    ])
}

fn definitions() -> Vec<Tool> {
    let media =
        json!({"type":"string","enum":["movie","episode","game","book","comic","anime","manga"]});
    let mut page = json!({"orderBy":{"type":"string","enum":["createdAt","lastWatched","lastAdded"]},"order":{"type":"string","enum":["asc","desc"]},"pageSize":{"type":"integer","minimum":1,"maximum":100},"cursor":{"type":"string"}});
    let list = page.clone();
    page["query"] = json!({"type":"string","minLength":1});
    let detail = json!({"watchlistId":{"type":"integer","minimum":1},"pageSize":{"type":"integer","minimum":1,"maximum":100},"cursor":{"type":"string"},"resultView":{"type":"string","enum":["items","titles"]}});
    let mut find = detail.clone();
    find["watchlistItemId"] = json!({"type":"integer","minimum":1});
    find["provider"] = json!({"type":"string","minLength":1});
    find["providerId"] = json!({"type":"string","minLength":1});
    find["mediaType"] = media;
    find["query"] = json!({"type":"string","minLength":1});
    let mut tools: Vec<Tool> = [
        ("list_watchlists", "List watchlists", list, vec![]),
        (
            "search_watchlists",
            "Search watchlists",
            page,
            vec!["query"],
        ),
        (
            "get_watchlist",
            "Get watchlist",
            detail,
            vec!["watchlistId"],
        ),
        (
            "find_watchlist_items",
            "Find watchlist items",
            find,
            vec!["watchlistId"],
        ),
    ]
    .into_iter()
    .map(|(name, title, properties, required)| {
        let mut tool = Tool::new(name, title, object_schema(properties, json!(required)));
        tool.title = Some(title.into());
        tool.output_schema = Some(std::sync::Arc::new(super::contracts::output_schema(name)));
        tool.annotations = Some(ToolAnnotations::new().read_only(true).destructive(false));
        tool
    })
    .collect();
    let mut reorder = Tool::new(
        "reorder_watchlist_items",
        "Reorder watchlist items",
        object_schema(
            json!({"reorders":{"type":"array","minItems":1,"items":{"type":"object","properties":{"watchlistId":{"type":"integer"},"movedItemId":{"type":"integer"},"referenceItemId":{"type":"integer"},"position":{"type":"string","enum":["before","after"]}}}}}),
            json!(["reorders"]),
        ),
    );
    reorder.title = Some("Reorder watchlist items".into());
    reorder.description = Some("Reorder one or more watchlist items within a custom-ordered watchlist, moving each item before or after a reference item. Each reorder targets an explicit watchlist, moved item ID, reference item ID, and before-or-after position, is processed independently, and returns an ordered result. Only custom-ordered watchlists accept reorders. This changes the order of items and is consequential, so confirm before applying.".into());
    reorder.output_schema = Some(std::sync::Arc::new(object_schema(
        json!({"results":{"type":"array","items":{"type":"object","properties":{"index":{"type":"integer","minimum":0},"success":{"type":"boolean"},"code":{"type":"string"},"message":{"type":"string"},"watchlistId":{"type":"number"},"movedItemId":{"type":"number"},"referenceItemId":{"type":"number"}},"required":["index","success","code","message"]}}}),
        json!(["results"]),
    )));
    reorder.annotations = Some(
        ToolAnnotations::new()
            .read_only(false)
            .destructive(true)
            .idempotent(false),
    );
    tools.push(reorder);
    tools
}

impl ServerHandler for ReadMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("janus", "1.0.0"))
    }

    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult {
            tools: definitions(),
            ..Default::default()
        })
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        definitions().into_iter().find(|tool| tool.name == name)
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        if self.get_tool(&request.name).is_none() {
            return Err(ErrorData::method_not_found::<CallToolRequestMethod>());
        }
        if request.name == "reorder_watchlist_items" {
            let arguments = Value::Object(request.arguments.unwrap_or_default());
            let Some(entries) = arguments
                .get("reorders")
                .and_then(Value::as_array)
                .filter(|entries| !entries.is_empty())
            else {
                return Err(ErrorData::invalid_params(
                    "reorders must be a non-empty array",
                    None,
                ));
            };
            for entry in entries {
                if !entry.is_object()
                    || ["watchlistId", "movedItemId", "referenceItemId"]
                        .iter()
                        .any(|key| {
                            entry
                                .get(*key)
                                .is_some_and(|value| value.as_i64().is_none())
                        })
                    || entry
                        .get("position")
                        .is_some_and(|value| !matches!(value.as_str(), Some("before" | "after")))
                {
                    return Err(ErrorData::invalid_params("Invalid reorder input", None));
                }
            }
            let mut results = Vec::new();
            for (index, entry) in entries.iter().enumerate() {
                let mut result = match (
                    entry.get("watchlistId").and_then(Value::as_i64),
                    serde_json::from_value::<super::reorder::Reorder>(entry.clone()),
                ) {
                    (Some(id), Ok(input)) => match self.0.reorder(id, input).await {
                        Ok(super::reorder::ReorderOutcome::Reordered) => {
                            json!({"success":true,"code":"reordered","message":"Watchlist items reordered."})
                        }
                        Ok(super::reorder::ReorderOutcome::Rejected(failure)) => {
                            json!({"success":false,"code":failure.code(),"message":failure.message()})
                        }
                        Err(error) => {
                            eprintln!(
                                "MCP reorder failed for watchlist {id}, batch entry {index}: {error}"
                            );
                            json!({"success":false,"code":"internal_error","message":"Unable to reorder watchlist items."})
                        }
                    },
                    _ => {
                        json!({"success":false,"code":"validation_error","message":"watchlistId, movedItemId, referenceItemId, and position are required."})
                    }
                };
                result["index"] = json!(index);
                for key in ["watchlistId", "movedItemId", "referenceItemId"] {
                    if let Some(value) = entry.get(key) {
                        result[key] = value.clone();
                    }
                }
                results.push(result);
            }
            let mut response = CallToolResult::structured(json!({"results":results}));
            response.result_type = None;
            response.is_error = None;
            return Ok(response.into());
        }
        let operation = match request.name.as_ref() {
            "list_watchlists" => DiscoveryOperation::List,
            "search_watchlists" => DiscoveryOperation::Search,
            "get_watchlist" => DiscoveryOperation::Get,
            "find_watchlist_items" => DiscoveryOperation::Find,
            _ => unreachable!(),
        };
        let arguments = normalize(
            operation,
            Value::Object(request.arguments.unwrap_or_default()),
        );
        let discovered = match request_arguments(&arguments) {
            Ok(request) => {
                if operation.is_summary() {
                    self.0
                        .summaries(operation, request)
                        .await
                        .map(summary_envelope)
                } else {
                    self.0.items(operation, request).await.map(item_envelope)
                }
            }
            Err(message) => Err(DiscoveryError::InvalidInput(message)),
        };
        match discovered.map_err(|error| match error {
            DiscoveryError::InvalidInput(message) => message,
            DiscoveryError::Database(_) => {
                if operation.is_summary() {
                    "Unable to load watchlists.".into()
                } else {
                    "Unable to load watchlist.".into()
                }
            }
        }) {
            Ok(data) => {
                let mut result = CallToolResult::structured(data);
                result.result_type = None;
                result.is_error = None;
                Ok(result.into())
            }
            Err(message) => {
                let mut result = CallToolResult::error(vec![ContentBlock::text(message)]);
                result.result_type = None;
                Ok(result.into())
            }
        }
    }
}

fn summary_envelope(page: SummaryPage) -> Value {
    let mut value = json!({
        "watchlists": page.watchlists.iter().map(summary_json).collect::<Vec<_>>(),
    });
    if let Some(cursor) = page.next_cursor {
        value["nextCursor"] = json!(cursor);
    }
    value
}

fn item_envelope(page: ItemPage) -> Value {
    let mut value = match &page.results {
        ItemResults::Items(items) => json!({
            "items": items.iter().map(item_projection).collect::<Vec<_>>(),
        }),
        ItemResults::Titles(titles) => json!({
            "titles": titles.iter().map(title_json).collect::<Vec<_>>(),
        }),
    };
    if let Some(cursor) = page.next_cursor {
        value["nextCursor"] = json!(cursor);
    }
    if let Some(watchlist) = page.watchlist {
        value["watchlist"] = summary_json(&watchlist);
    }
    if let Some(token) = page.order_token {
        value["orderToken"] = json!(token);
    }
    value
}

/// Full stored-item projection used by detail stats.
fn item_json(item: &super::WatchlistItem) -> Value {
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
fn item_projection(item: &super::WatchlistItem) -> Value {
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

fn record_json(record: &super::WatchlistRecord) -> Value {
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

fn stats_json(stats: &super::WatchlistStats) -> Value {
    json!({
        "totalItems": stats.total_items,
        "watchedItems": stats.watched_items,
        "progress": stats.progress,
        "nextUnwatched": stats.next_unwatched.as_ref().map(item_json),
        "coverImage": stats.cover_image,
        "coverMediaType": stats.cover_media_type,
    })
}

fn summary_json(summary: &super::WatchlistSummary) -> Value {
    let mut value = record_json(&summary.watchlist);
    value["stats"] = stats_json(&summary.stats);
    value
}

fn title_json(title: &GroupedTitle) -> Value {
    json!({
        "provider": title.source,
        "providerId": title.provider_id,
        "mediaType": title.media_type,
        "title": title.title,
        "matchingItemCount": title.matching_item_count,
    })
}

/// Builds the typed request from normalized MCP arguments.
///
/// Unknown fields were already removed and the legacy `get_watchlist` selector
/// was already coerced. Value types and integral numbers stay adapter concerns;
/// semantic rules belong to discovery.
fn request_arguments(arguments: &Value) -> Result<DiscoveryRequest, String> {
    let object = arguments
        .as_object()
        .ok_or_else(|| "Invalid tool arguments.".to_owned())?;
    let text = |key: &str| -> Result<Option<String>, String> {
        object
            .get(key)
            .map(|value| {
                value
                    .as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| format!("Invalid {key}."))
            })
            .transpose()
    };
    let number = |key: &str| -> Result<Option<i64>, String> {
        object
            .get(key)
            .map(|value| {
                value
                    .as_f64()
                    .filter(|number| {
                        number.is_finite()
                            && number.fract() == 0.0
                            && *number > 0.0
                            && *number < i64::MAX as f64
                    })
                    .map(|number| number as i64)
                    .ok_or_else(|| format!("Invalid {key}."))
            })
            .transpose()
    };
    Ok(DiscoveryRequest {
        query: text("query")?,
        order_by: text("orderBy")?,
        order: text("order")?,
        page_size: number("pageSize")?,
        cursor: text("cursor")?,
        watchlist_id: number("watchlistId")?,
        watchlist_item_id: number("watchlistItemId")?,
        provider: text("provider")?,
        provider_id: text("providerId")?,
        media_type: text("mediaType")?,
        result_view: text("resultView")?,
    })
}

fn normalize(operation: DiscoveryOperation, mut arguments: Value) -> Value {
    let fields: &[&str] = match operation {
        DiscoveryOperation::List => &["orderBy", "order", "pageSize", "cursor"],
        DiscoveryOperation::Search => &["query", "orderBy", "order", "pageSize", "cursor"],
        DiscoveryOperation::Get => &["watchlistId", "pageSize", "cursor", "resultView"],
        DiscoveryOperation::Find => &[
            "watchlistId",
            "watchlistItemId",
            "provider",
            "providerId",
            "mediaType",
            "query",
            "pageSize",
            "cursor",
            "resultView",
        ],
    };
    let object = arguments.as_object_mut().unwrap();
    object.retain(|key, _| fields.contains(&key.as_str()));
    if operation == DiscoveryOperation::Get
        && let Some(value) = object.get_mut("watchlistId")
        && let Some(number) = coerced_number(value, false).and_then(serde_json::Number::from_f64)
    {
        *value = Value::Number(number);
    }
    arguments
}
// Zod's get_watchlist selector uses JavaScript Number coercion. Other selectors
// and page sizes accept JSON numbers only, including integral decimal notation.
fn coerced_number(value: &Value, in_array: bool) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::Bool(true) if !in_array => Some(1.0),
        Value::String(text) => {
            let text = text.trim();
            let radix = if text.starts_with("0x") || text.starts_with("0X") {
                Some(16)
            } else if text.starts_with("0b") || text.starts_with("0B") {
                Some(2)
            } else if text.starts_with("0o") || text.starts_with("0O") {
                Some(8)
            } else {
                None
            };
            if let Some(radix) = radix {
                u64::from_str_radix(&text[2..], radix)
                    .ok()
                    .map(|number| number as f64)
            } else {
                text.parse().ok()
            }
        }
        Value::Array(values) if values.len() == 1 => coerced_number(&values[0], true),
        _ => None,
    }
}
