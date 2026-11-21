//! MCP page contracts: tools whose results are paginated envelopes.

use super::{McpCallError, object_schema, output_schema};
use crate::features::watchlists::{
    WatchlistItem, WatchlistRecord, WatchlistStats, WatchlistSummary, Watchlists,
    discovery::{
        DiscoveryError, DiscoveryOperation, DiscoveryRequest, GroupedTitle, ItemPage, ItemResults,
        MEDIA_TYPES, SummaryPage,
    },
};
use rmcp::model::{Tool, ToolAnnotations};
use serde_json::{Map, Value, json};
use std::sync::{Arc, LazyLock};

const LIST_FIELDS: &[&str] = &["orderBy", "order", "pageSize", "cursor"];
const SEARCH_FIELDS: &[&str] = &["query", "orderBy", "order", "pageSize", "cursor"];
const GET_FIELDS: &[&str] = &["watchlistId", "pageSize", "cursor", "resultView"];
const FIND_FIELDS: &[&str] = &[
    "watchlistId",
    "watchlistItemId",
    "provider",
    "providerId",
    "mediaType",
    "query",
    "pageSize",
    "cursor",
    "resultView",
];

pub(super) struct Contract {
    pub(super) name: &'static str,
    pub(super) tool: Tool,
    pub(super) accepted: &'static [&'static str],
    operation: DiscoveryOperation,
}

static CONTRACTS: LazyLock<Vec<Contract>> = LazyLock::new(build_contracts);

/// Declarations for every page-shaped tool, in protocol listing order.
pub(super) fn tools() -> Vec<Tool> {
    CONTRACTS
        .iter()
        .map(|contract| contract.tool.clone())
        .collect()
}

pub(super) fn tool(name: &str) -> Option<Tool> {
    contract(name).map(|contract| contract.tool.clone())
}

pub(super) fn contract(name: &str) -> Option<&'static Contract> {
    CONTRACTS.iter().find(|contract| contract.name == name)
}

pub(super) async fn call(
    lists: &Watchlists,
    contract: &Contract,
    arguments: Map<String, Value>,
) -> Result<Value, McpCallError> {
    let operation = contract.operation;
    let arguments = normalize(contract, arguments);
    let request = request_from_arguments(&arguments).map_err(McpCallError::Failure)?;
    let discovered = if operation.is_summary() {
        lists
            .summaries(operation, request)
            .await
            .map(summary_envelope)
    } else {
        lists.items(operation, request).await.map(item_envelope)
    };
    discovered.map_err(|error| McpCallError::Failure(message_for(operation, error)))
}

fn message_for(operation: DiscoveryOperation, error: DiscoveryError) -> String {
    match error {
        DiscoveryError::InvalidInput(message) => message,
        DiscoveryError::Database(_) if operation.is_summary() => {
            "Unable to load watchlists.".into()
        }
        DiscoveryError::Database(_) => "Unable to load watchlist.".into(),
    }
}

fn build_contracts() -> Vec<Contract> {
    let media = json!({"type":"string","enum": MEDIA_TYPES});
    let page = json!({"orderBy":{"type":"string","enum":["createdAt","lastWatched","lastAdded"]},"order":{"type":"string","enum":["asc","desc"]},"pageSize":{"type":"integer","minimum":1,"maximum":100},"cursor":{"type":"string"}});
    let list = page.clone();
    let mut search = page.clone();
    search["query"] = json!({"type":"string","minLength":1});
    let detail = json!({"watchlistId":{"type":"integer","minimum":1},"pageSize":{"type":"integer","minimum":1,"maximum":100},"cursor":{"type":"string"},"resultView":{"type":"string","enum":["items","titles"]}});
    let mut find = detail.clone();
    find["watchlistItemId"] = json!({"type":"integer","minimum":1});
    find["provider"] = json!({"type":"string","minLength":1});
    find["providerId"] = json!({"type":"string","minLength":1});
    find["mediaType"] = media.clone();
    find["query"] = json!({"type":"string","minLength":1});

    let item = item_schema(&media);
    let title = title_schema(&media);
    let summary = summary_schema(&media);

    let item_properties = json!({"items":{"type":"array","items":item},"titles":{"type":"array","items":title},"nextCursor":{"type":"string"}});
    let summary_page = output_schema(
        json!({"watchlists":{"type":"array","items":summary},"nextCursor":{"type":"string"}}),
        Some(json!(["watchlists"])),
    );
    let item_page = output_schema(item_properties.clone(), None);
    let mut detail_properties = item_properties;
    detail_properties["watchlist"] = summary;
    detail_properties["orderToken"] = json!({"type":"string"});
    let detail_page = output_schema(detail_properties, Some(json!(["watchlist"])));

    vec![
        read_contract(
            "list_watchlists",
            "List watchlists",
            list,
            json!([]),
            summary_page.clone(),
            LIST_FIELDS,
            DiscoveryOperation::List,
        ),
        read_contract(
            "search_watchlists",
            "Search watchlists",
            search,
            json!(["query"]),
            summary_page,
            SEARCH_FIELDS,
            DiscoveryOperation::Search,
        ),
        read_contract(
            "get_watchlist",
            "Get watchlist",
            detail,
            json!(["watchlistId"]),
            detail_page,
            GET_FIELDS,
            DiscoveryOperation::Get,
        ),
        read_contract(
            "find_watchlist_items",
            "Find watchlist items",
            find,
            json!(["watchlistId"]),
            item_page,
            FIND_FIELDS,
            DiscoveryOperation::Find,
        ),
    ]
}

fn read_contract(
    name: &'static str,
    title: &'static str,
    properties: Value,
    required: Value,
    output_schema: Arc<Map<String, Value>>,
    accepted: &'static [&'static str],
    operation: DiscoveryOperation,
) -> Contract {
    let mut tool = Tool::new(name, title, object_schema(properties, required));
    tool.title = Some(title.into());
    tool.output_schema = Some(output_schema);
    tool.annotations = Some(ToolAnnotations::new().read_only(true).destructive(false));
    Contract {
        name,
        tool,
        accepted,
        operation,
    }
}

fn item_schema(media: &Value) -> Value {
    json!({"type":"object","properties":{"id":{"type":"number"},"watchlistId":{"type":"number"},"provider":{"type":"string"},"providerId":{"type":"string"},"mediaType":media,"title":{"type":"string"},"parent":{"type":"object","properties":{"providerId":{"type":["string","null"]},"title":{"type":["string","null"]}},"required":["providerId","title"]},"episode":{"type":["string","null"]},"isWatched":{"type":["boolean","null"]}},"required":["id","watchlistId","provider","providerId","mediaType","title","parent","episode","isWatched"]})
}

fn title_schema(media: &Value) -> Value {
    json!({"type":"object","properties":{"provider":{"type":"string"},"providerId":{"type":"string"},"mediaType":media,"title":{"type":"string"},"matchingItemCount":{"type":"number"}},"required":["provider","providerId","mediaType","title","matchingItemCount"]})
}

fn summary_schema(media: &Value) -> Value {
    let nullable_string = json!({"type":["string","null"]});
    json!({"type":"object","properties":{"id":{"type":"number"},"name":{"type":"string"},"description":nullable_string,"itemOrderMode":{"type":"string","enum":["release","custom"]},"createdAt":{"type":"string"},"updatedAt":nullable_string,"lastWatchedAt":nullable_string,"lastItemAddedAt":nullable_string,"pausedAt":nullable_string,"stats":{"type":"object","properties":{"totalItems":{"type":"number"},"watchedItems":{"type":"number"},"progress":{"type":"number"},"nextUnwatched":{},"coverImage":nullable_string,"coverMediaType":{"anyOf":[media,{"type":"null"}]}},"required":["totalItems","watchedItems","progress","nextUnwatched","coverImage","coverMediaType"]}},"required":["id","name","description","itemOrderMode","createdAt","updatedAt","lastWatchedAt","lastItemAddedAt","pausedAt","stats"]})
}

/// Only `get_watchlist` coerces its selector: v1's Zod schema used JavaScript
/// `Number` there. Other selectors and page sizes accept JSON numbers only.
fn normalize(contract: &Contract, arguments: Map<String, Value>) -> Map<String, Value> {
    let mut arguments = arguments;
    arguments.retain(|key, _| contract.accepted.contains(&key.as_str()));
    if contract.name == "get_watchlist"
        && let Some(value) = arguments.get_mut("watchlistId")
        && let Some(number) = coerced_number(value, false).and_then(serde_json::Number::from_f64)
    {
        *value = Value::Number(number);
    }
    arguments
}

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

fn request_from_arguments(arguments: &Map<String, Value>) -> Result<DiscoveryRequest, String> {
    let text = |key: &str| -> Result<Option<String>, String> {
        arguments
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
        arguments
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

fn stored_item_json(item: &WatchlistItem) -> Value {
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
        "nextUnwatched": stats.next_unwatched.as_ref().map(stored_item_json),
        "coverImage": stats.cover_image,
        "coverMediaType": stats.cover_media_type,
    })
}

fn summary_json(summary: &WatchlistSummary) -> Value {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::watchlists::ItemOrderMode;
    use crate::features::watchlists::mcp::contract_check::{
        assert_accepted_matches_declared, assert_output_matches,
    };

    fn item() -> WatchlistItem {
        WatchlistItem {
            id: 7,
            watchlist_id: 3,
            tmdb_id: "tmdb-7".into(),
            source: "tmdb".into(),
            media_type: "episode".into(),
            title: "Pilot".into(),
            parent_id: Some("tmdb-1".into()),
            parent_title: Some("Show".into()),
            season: Some(1),
            episode: Some("S01E01".into()),
            poster_path: Some("/pilot.jpg".into()),
            release_date: Some("2020-01-01".into()),
            vote_average: Some(7.5),
            runtime: Some(42),
            custom_rank: None,
            is_watched: None,
            authors: None,
            added_at: "2020-01-02 00:00:00".into(),
        }
    }

    fn summary() -> WatchlistSummary {
        WatchlistSummary {
            watchlist: WatchlistRecord {
                id: 3,
                name: "Shows".into(),
                description: None,
                item_order_mode: ItemOrderMode::Release,
                created_at: "2020-01-01 00:00:00".into(),
                updated_at: None,
                last_watched_at: None,
                last_item_added_at: None,
                paused_at: None,
            },
            stats: WatchlistStats {
                total_items: 1,
                watched_items: 0,
                progress: 0,
                next_unwatched: Some(item()),
                cover_image: Some("/pilot.jpg".into()),
                cover_media_type: Some("episode".into()),
            },
        }
    }

    fn page_contract(name: &str) -> &'static Contract {
        contract(name).unwrap_or_else(|| panic!("{name} is not a page contract"))
    }

    fn assert_page_output(name: &str, value: &Value) {
        let contract = page_contract(name);
        assert_output_matches(contract.name, &contract.tool, value);
    }

    #[test]
    fn every_page_contract_accepts_exactly_its_declared_fields() {
        for contract in CONTRACTS.iter() {
            assert_accepted_matches_declared(contract.name, &contract.tool, contract.accepted);
        }
    }

    #[test]
    fn summary_pages_satisfy_the_list_and_search_schema() {
        let page = summary_envelope(SummaryPage {
            watchlists: vec![summary()],
            next_cursor: Some("cursor".into()),
        });
        assert_page_output("list_watchlists", &page);
        assert_page_output("search_watchlists", &page);
    }

    #[test]
    fn item_pages_satisfy_the_get_schema() {
        let page = item_envelope(ItemPage {
            watchlist: Some(summary()),
            results: ItemResults::Items(vec![item()]),
            next_cursor: None,
            order_token: Some("token".into()),
        });
        assert_page_output("get_watchlist", &page);
    }

    #[test]
    fn title_pages_satisfy_the_find_schema() {
        let page = item_envelope(ItemPage {
            watchlist: None,
            results: ItemResults::Titles(vec![GroupedTitle {
                source: "tmdb".into(),
                provider_id: "tmdb-1".into(),
                media_type: "episode".into(),
                title: "Show".into(),
                matching_item_count: 1,
            }]),
            next_cursor: None,
            order_token: None,
        });
        assert_page_output("find_watchlist_items", &page);
    }
}
