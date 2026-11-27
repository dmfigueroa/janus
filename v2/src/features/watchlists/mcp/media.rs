//! MCP adapters for provider search and watchlist addition.
//!
//! `search_media` is page-shaped, but its envelope is an offset page with a
//! status, not the cursor page the watchlist read tools return.
//! `add_media_to_watchlists` follows the batch envelope: ordered per-entry
//! results, and a bad entry does not stop the rest.

use super::super::Watchlists;
use super::super::addition::{
    InsertionIntent, InsertionPosition, MediaAddition, ProviderConfig, WatchlistWriteResult,
    WriteFailure, add_provider_media,
};
use super::{McpCallError, object_schema, output_schema};
use crate::features::search::{
    MediaSearchOutcome, SearchableMediaType, UnifiedMedia, search_media,
};
use crate::integrations::tmdb::TmdbCatalog;
use rmcp::model::{Tool, ToolAnnotations};
use serde_json::{Map, Value, json};
use std::sync::LazyLock;

const SEARCH_FIELDS: &[&str] = &["query", "mediaType", "page"];

struct SearchContract {
    tool: Tool,
}

static SEARCH: LazyLock<SearchContract> = LazyLock::new(search_contract);

const ADD_FIELDS: &[&str] = &["additions"];
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const PROVIDERS: &[&str] = &["tmdb", "rawg", "google_books", "comicvine", "anilist"];

struct AddContract {
    tool: Tool,
}

static ADD: LazyLock<AddContract> = LazyLock::new(add_contract);

pub(super) fn tools() -> Vec<Tool> {
    vec![SEARCH.tool.clone(), ADD.tool.clone()]
}

pub(super) fn tool(name: &str) -> Option<Tool> {
    match name {
        "search_media" => Some(SEARCH.tool.clone()),
        "add_media_to_watchlists" => Some(ADD.tool.clone()),
        _ => None,
    }
}

pub(super) fn is_search(name: &str) -> bool {
    name == "search_media"
}

pub(super) fn is_add(name: &str) -> bool {
    name == "add_media_to_watchlists"
}

pub(super) async fn call_search(
    catalog: &dyn TmdbCatalog,
    mut arguments: Map<String, Value>,
) -> Result<Value, McpCallError> {
    arguments.retain(|key, _| SEARCH_FIELDS.contains(&key.as_str()));
    let (query, media_type, page) = parse_search(&arguments).map_err(McpCallError::Failure)?;
    Ok(outcome_json(
        search_media(catalog, &query, media_type, page).await,
    ))
}

fn parse_search(
    arguments: &Map<String, Value>,
) -> Result<(String, SearchableMediaType, i64), String> {
    let Some(query) = arguments.get("query").and_then(Value::as_str) else {
        return Err("Invalid query.".into());
    };
    let Some(media_type) = arguments
        .get("mediaType")
        .and_then(Value::as_str)
        .and_then(SearchableMediaType::parse)
    else {
        return Err("Invalid mediaType.".into());
    };
    let page = match arguments.get("page") {
        None => 1,
        Some(Value::Number(number)) => number
            .as_i64()
            .filter(|page| (1..=100).contains(page))
            .ok_or_else(|| "Invalid page.".to_owned())?,
        Some(_) => return Err("Invalid page.".into()),
    };
    Ok((query.to_owned(), media_type, page))
}

fn outcome_json(outcome: MediaSearchOutcome) -> Value {
    match outcome {
        MediaSearchOutcome::Results {
            results,
            page,
            total_pages,
            total_results,
        } => json!({
            "success": true,
            "results": results.into_iter().map(hit_json).collect::<Vec<_>>(),
            "page": page,
            "totalPages": total_pages,
            "totalResults": total_results,
        }),
        rejected => json!({
            "success": false,
            "code": rejected.status(),
            "message": rejected.message().unwrap_or(""),
        }),
    }
}

fn hit_json(hit: UnifiedMedia) -> Value {
    let mut value = json!({
        "provider": hit.provider.as_str(),
        "providerId": hit.id,
        "mediaType": hit.media_type.as_str(),
        "title": hit.title,
        "posterImage": hit.poster,
    });
    if let Some(release_date) = hit.release_date {
        value["releaseDate"] = Value::String(release_date);
    }
    if let Some(year) = hit.year {
        value["year"] = Value::String(year);
    }
    if let Some(overview) = hit.overview {
        value["overview"] = Value::String(overview);
    }
    value
}

pub(super) async fn call_add(
    lists: &Watchlists,
    catalog: &dyn TmdbCatalog,
    mut arguments: Map<String, Value>,
) -> Result<Value, McpCallError> {
    arguments.retain(|key, _| ADD_FIELDS.contains(&key.as_str()));
    let additions = arguments
        .get("additions")
        .and_then(Value::as_array)
        .filter(|entries| !entries.is_empty())
        .ok_or_else(|| {
            McpCallError::InvalidRequest("additions must be a non-empty array".into())
        })?;
    if additions.iter().any(|entry| !entry.is_object()) {
        return Err(McpCallError::InvalidRequest(
            "Invalid media addition input".into(),
        ));
    }
    let config = ProviderConfig::from_env();
    let mut results = Vec::with_capacity(additions.len());
    for (index, entry) in additions.iter().enumerate() {
        let identity = identity(entry);
        let outcome = match entry.as_object() {
            Some(entry) => match parse_addition(entry) {
                Ok(addition) => add_provider_media(lists, catalog, &config, &addition).await,
                Err(message) => validation_error(message),
            },
            None => validation_error("Invalid media addition."),
        };
        results.push(result_json(index, &identity, &outcome));
    }
    Ok(json!({ "results": results }))
}

fn search_contract() -> SearchContract {
    let media_type = json!({
        "type": "string",
        "enum": ["movie", "tv", "game", "book", "comic", "anime", "manga"]
    });
    let hit = json!({
        "type": "object",
        "properties": {
            "provider": {"type": "string", "enum": ["tmdb", "rawg", "google_books", "comicvine", "anilist"]},
            "providerId": {"type": "string"},
            "mediaType": media_type,
            "title": {"type": "string"},
            "releaseDate": {"type": "string"},
            "year": {"type": "string"},
            "overview": {"type": "string"},
            "posterImage": {"type": ["string", "null"]}
        },
        "required": ["provider", "providerId", "mediaType", "title", "posterImage"]
    });
    let mut tool = Tool::new(
        "search_media",
        "Search supported media providers",
        object_schema(
            json!({
                "query": {"type": "string"},
                "mediaType": {"type": "string", "enum": ["movie", "tv", "game", "book", "comic", "anime", "manga"]},
                "page": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}
            }),
            json!(["query", "mediaType"]),
        ),
    );
    tool.title = Some("Search supported media providers".into());
    tool.description = Some(
        "Search TMDB for movies and TV, RAWG for games, Google Books for books, ComicVine for comics, or AniList for anime and manga. Anime and manga search remains unavailable while Janus reviews provider data quality."
            .into(),
    );
    tool.output_schema = Some(output_schema(
        json!({
            "success": {"type": "boolean"},
            "code": {"type": "string"},
            "message": {"type": "string"},
            "results": {"type": "array", "items": hit},
            "page": {"type": "number"},
            "totalPages": {"type": "number"},
            "totalResults": {"type": "number"}
        }),
        Some(json!(["success"])),
    ));
    tool.annotations = Some(ToolAnnotations::new().read_only(true).destructive(false));
    SearchContract { tool }
}

fn add_contract() -> AddContract {
    // Match v1 Zod → JSON Schema: watchlistId is `z.number()` (type number);
    // referenceItemId is `z.number().int().positive()` (integer, minimum 1).
    let entry = json!({
        "type": "object",
        "properties": {
            "watchlistId": {"type": "number"},
            "provider": {"type": "string", "enum": ["tmdb", "rawg", "google_books", "comicvine", "anilist"]},
            "providerId": {"type": "string"},
            "mediaType": {
                "type": "string",
                "enum": ["movie", "tv", "episode", "game", "book", "comic", "comic_issue", "anime", "manga"]
            },
            "parent": {
                "type": "object",
                "properties": {
                    "providerId": {"type": "string"},
                    "title": {"type": "string"}
                }
            },
            "insertionPosition": {"type": "string", "enum": ["beginning", "end", "before", "after"]},
            "referenceItemId": {"type": "integer", "minimum": 1}
        }
    });
    let mut tool = Tool::new(
        "add_media_to_watchlists",
        "Add provider-backed media to watchlists",
        object_schema(
            json!({
                "additions": {"type": "array", "minItems": 1, "items": entry}
            }),
            json!(["additions"]),
        ),
    );
    tool.title = Some("Add provider-backed media to watchlists".into());
    tool.description = Some(
        "Add TMDB movies, TV, or individual episodes; RAWG games; Google Books books; or ComicVine volumes or individual issues by provider ID. Janus fetches canonical provider metadata before persisting each addition. TMDB episode additions require their parent show ID. A ComicVine item copied from read tool results (mediaType \"comic\" with its parent volume) adds that single issue; a \"comic\" addition without a parent adds the whole volume. Anime and manga additions remain unavailable. TV additions expand into episodes, and ComicVine volume additions expand into issues, so they are consequential bulk actions requiring confirmation. Each requested addition is processed independently in input order and returns an ordered result."
            .into(),
    );
    tool.output_schema = Some(output_schema(
        json!({
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "index": {"type": "integer", "minimum": 0},
                        "success": {"type": "boolean"},
                        "code": {"type": "string"},
                        "message": {"type": "string"},
                        "watchlistId": {"type": "number"},
                        "provider": {"type": "string", "enum": ["tmdb", "rawg", "google_books", "comicvine", "anilist"]},
                        "providerId": {"type": "string"},
                        "affectedCount": {
                            "type": "integer",
                            "minimum": 0,
                            "description": "Number of items added when known; omitted when an unexpected failure leaves the count unknown."
                        }
                    },
                    "required": ["index", "success", "code", "message"]
                }
            }
        }),
        Some(json!(["results"])),
    ));
    tool.annotations = Some(
        ToolAnnotations::new()
            .read_only(false)
            .destructive(false)
            .idempotent(false),
    );
    AddContract { tool }
}

struct Identity {
    watchlist_id: Option<i64>,
    provider: Option<String>,
    provider_id: Option<String>,
}

fn identity(entry: &Value) -> Identity {
    let object = entry.as_object();
    Identity {
        watchlist_id: object.and_then(|entry| positive_int(entry.get("watchlistId"))),
        provider: object
            .and_then(|entry| entry.get("provider"))
            .and_then(Value::as_str)
            .filter(|provider| PROVIDERS.contains(provider))
            .map(str::to_owned),
        provider_id: object
            .and_then(|entry| entry.get("providerId"))
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}

fn result_json(index: usize, identity: &Identity, outcome: &WatchlistWriteResult) -> Value {
    let mut value = json!({
        "index": index,
        "success": outcome.success(),
        "code": outcome.code(),
        "message": outcome.message(),
        "affectedCount": outcome.affected_count(),
    });
    if let Some(watchlist_id) = identity.watchlist_id {
        value["watchlistId"] = json!(watchlist_id);
    }
    if let Some(provider) = &identity.provider {
        value["provider"] = json!(provider);
    }
    if let Some(provider_id) = &identity.provider_id {
        value["providerId"] = json!(provider_id);
    }
    value
}

fn validation_error(message: impl Into<String>) -> WatchlistWriteResult {
    WatchlistWriteResult::failed(WriteFailure::ValidationError, message)
}

fn parse_addition(entry: &Map<String, Value>) -> Result<MediaAddition, String> {
    let watchlist_id = positive_int(entry.get("watchlistId")).ok_or("Invalid media addition.")?;
    let provider = entry
        .get("provider")
        .and_then(Value::as_str)
        .ok_or("Invalid media addition.")?;
    let provider_id = entry
        .get("providerId")
        .and_then(Value::as_str)
        .ok_or("Invalid media addition.")?;
    let media_type = entry
        .get("mediaType")
        .and_then(Value::as_str)
        .ok_or("Invalid media addition.")?;
    let addition = match (provider, media_type) {
        ("tmdb", "movie") => MediaAddition::Movie {
            watchlist_id,
            tmdb_id: tmdb_numeric_id(provider_id)?,
            insertion: InsertionIntent {
                position: None,
                reference_item_id: None,
            },
        },
        ("tmdb", "tv") => MediaAddition::Television {
            watchlist_id,
            show_id: tmdb_numeric_id(provider_id)?,
            title: String::new(),
            insertion: InsertionIntent {
                position: None,
                reference_item_id: None,
            },
        },
        ("tmdb", "episode") => {
            let (show_id, show_title) = parent_show(entry)?;
            MediaAddition::Episode {
                watchlist_id,
                episode_id: tmdb_numeric_id(provider_id)?,
                show_id,
                show_title,
                insertion: InsertionIntent {
                    position: None,
                    reference_item_id: None,
                },
            }
        }
        ("rawg", "game") => {
            required_provider_id(provider_id)?;
            MediaAddition::Game {
                watchlist_id,
                insertion: empty_insertion(),
            }
        }
        ("google_books", "book") => {
            required_provider_id(provider_id)?;
            MediaAddition::Book {
                watchlist_id,
                insertion: empty_insertion(),
            }
        }
        ("comicvine", "comic" | "comic_issue") => {
            required_provider_id(provider_id)?;
            MediaAddition::Comic {
                watchlist_id,
                insertion: empty_insertion(),
            }
        }
        ("anilist", "anime" | "manga") => {
            required_provider_id(provider_id)?;
            MediaAddition::Deprecated {
                watchlist_id,
                insertion: empty_insertion(),
            }
        }
        _ => return Err("Invalid media addition.".into()),
    };
    let insertion = insertion_intent(entry)?;
    Ok(with_insertion(addition, insertion))
}

fn empty_insertion() -> InsertionIntent {
    InsertionIntent {
        position: None,
        reference_item_id: None,
    }
}

fn with_insertion(addition: MediaAddition, insertion: InsertionIntent) -> MediaAddition {
    match addition {
        MediaAddition::Movie {
            watchlist_id,
            tmdb_id,
            ..
        } => MediaAddition::Movie {
            watchlist_id,
            tmdb_id,
            insertion,
        },
        MediaAddition::Television {
            watchlist_id,
            show_id,
            title,
            ..
        } => MediaAddition::Television {
            watchlist_id,
            show_id,
            title,
            insertion,
        },
        MediaAddition::Episode {
            watchlist_id,
            episode_id,
            show_id,
            show_title,
            ..
        } => MediaAddition::Episode {
            watchlist_id,
            episode_id,
            show_id,
            show_title,
            insertion,
        },
        MediaAddition::Game { watchlist_id, .. } => MediaAddition::Game {
            watchlist_id,
            insertion,
        },
        MediaAddition::Book { watchlist_id, .. } => MediaAddition::Book {
            watchlist_id,
            insertion,
        },
        MediaAddition::Comic { watchlist_id, .. } => MediaAddition::Comic {
            watchlist_id,
            insertion,
        },
        MediaAddition::Deprecated { watchlist_id, .. } => MediaAddition::Deprecated {
            watchlist_id,
            insertion,
        },
    }
}

fn insertion_intent(entry: &Map<String, Value>) -> Result<InsertionIntent, String> {
    let position = match entry.get("insertionPosition") {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) => Some(
            InsertionPosition::parse(value).ok_or_else(|| "Invalid media addition.".to_owned())?,
        ),
        Some(_) => return Err("Invalid media addition.".into()),
    };
    let reference_item_id = match entry.get("referenceItemId") {
        None | Some(Value::Null) => None,
        Some(value) => Some(positive_int(Some(value)).ok_or("Invalid media addition.")?),
    };
    if position.is_some_and(InsertionPosition::is_anchor) && reference_item_id.is_none() {
        return Err(
            "referenceItemId is required when insertionPosition is before or after.".into(),
        );
    }
    if !position.is_some_and(InsertionPosition::is_anchor) && reference_item_id.is_some() {
        return Err(
            "referenceItemId may only be set when insertionPosition is before or after.".into(),
        );
    }
    Ok(InsertionIntent {
        position,
        reference_item_id,
    })
}

fn required_provider_id(provider_id: &str) -> Result<(), String> {
    if provider_id.trim().is_empty() {
        Err("Provider ID is required.".into())
    } else {
        Ok(())
    }
}

fn tmdb_numeric_id(provider_id: &str) -> Result<u64, String> {
    if provider_id.is_empty() || !provider_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Provider ID must be a TMDB numeric ID.".into());
    }
    provider_id
        .parse()
        .map_err(|_| "Provider ID must be a TMDB numeric ID.".to_owned())
}

fn parent_show(entry: &Map<String, Value>) -> Result<(u64, Option<String>), String> {
    let parent = entry.get("parent").and_then(Value::as_object);
    let Some(provider_id) = parent
        .and_then(|parent| parent.get("providerId"))
        .and_then(Value::as_str)
    else {
        return Err("Parent provider ID must be a TMDB numeric ID.".into());
    };
    let trimmed = provider_id.trim();
    let numeric = trimmed.strip_prefix("tmdb:").unwrap_or(trimmed);
    if numeric.is_empty() || !numeric.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Parent provider ID must be a TMDB numeric ID.".into());
    }
    let show_id: u64 = numeric
        .parse()
        .map_err(|_| "Parent provider ID must be a positive safe integer.".to_owned())?;
    if show_id == 0 || show_id > MAX_SAFE_INTEGER {
        return Err("Parent provider ID must be a positive safe integer.".into());
    }
    let title = parent
        .and_then(|parent| parent.get("title"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_owned);
    Ok((show_id, title))
}

fn positive_int(value: Option<&Value>) -> Option<i64> {
    let number = value?.as_i64()?;
    (number > 0).then_some(number)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::watchlists::mcp::contract_check::assert_output_matches;

    #[test]
    fn search_projection_matches_its_output_schema() {
        let success = json!({
            "success": true,
            "results": [{
                "provider": "tmdb",
                "providerId": "550",
                "mediaType": "movie",
                "title": "Fight Club",
                "releaseDate": "1999-10-15",
                "year": "1999",
                "overview": "Club.",
                "posterImage": null
            }],
            "page": 1,
            "totalPages": 1,
            "totalResults": 1
        });
        let rejected = json!({
            "success": false,
            "code": "empty_query",
            "message": "Enter a search term to find media."
        });
        assert_output_matches("search_media", &SEARCH.tool, &success);
        assert_output_matches("search_media", &SEARCH.tool, &rejected);
    }

    #[test]
    fn addition_projection_matches_its_output_schema() {
        let added = json!({
            "results": [{
                "index": 0,
                "success": true,
                "code": "added",
                "message": "Added to watchlist",
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "550",
                "affectedCount": 1
            }]
        });
        let rejected = json!({
            "results": [{
                "index": 1,
                "success": false,
                "code": "validation_error",
                "message": "Parent provider ID must be a TMDB numeric ID.",
                "affectedCount": 0
            }]
        });
        assert_output_matches("add_media_to_watchlists", &ADD.tool, &added);
        assert_output_matches("add_media_to_watchlists", &ADD.tool, &rejected);
    }

    #[test]
    fn episode_parents_and_anchors_keep_v1_messages() {
        let cases = [
            (
                json!({"watchlistId": 42, "provider": "tmdb", "providerId": "1002", "mediaType": "episode", "parent": {"providerId": "1399junk"}}),
                "Parent provider ID must be a TMDB numeric ID.",
            ),
            (
                json!({"watchlistId": 42, "provider": "tmdb", "providerId": "1002", "mediaType": "episode", "parent": {"providerId": "0"}}),
                "Parent provider ID must be a positive safe integer.",
            ),
            (
                json!({"watchlistId": 42, "provider": "tmdb", "providerId": "1002", "mediaType": "episode", "parent": {"providerId": "9007199254740992"}}),
                "Parent provider ID must be a positive safe integer.",
            ),
            (
                json!({"watchlistId": 42, "provider": "tmdb", "providerId": "550", "mediaType": "movie", "insertionPosition": "before"}),
                "referenceItemId is required when insertionPosition is before or after.",
            ),
            (
                json!({"watchlistId": 42, "provider": "tmdb", "providerId": "550", "mediaType": "movie", "referenceItemId": 101}),
                "referenceItemId may only be set when insertionPosition is before or after.",
            ),
            (
                json!({"watchlistId": 42, "provider": "rawg", "providerId": "   ", "mediaType": "game"}),
                "Provider ID is required.",
            ),
        ];
        for (entry, message) in cases {
            let error = parse_addition(entry.as_object().unwrap()).unwrap_err();
            assert_eq!(error, message);
        }
        let show = parse_addition(
            json!({"watchlistId": 42, "provider": "tmdb", "providerId": "1002", "mediaType": "episode", "parent": {"providerId": "tmdb:1399", "title": "Canonical Show"}})
                .as_object()
                .unwrap(),
        )
        .unwrap();
        assert!(matches!(
            show,
            MediaAddition::Episode {
                episode_id: 1002,
                show_id: 1399,
                ..
            }
        ));
    }
}
