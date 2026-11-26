//! MCP adapter for provider search. Addition uses the same module once it lands.
//!
//! `search_media` is page-shaped, but its envelope is an offset page with a
//! status, not the cursor page the watchlist read tools return.

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

pub(super) fn tools() -> Vec<Tool> {
    vec![SEARCH.tool.clone()]
}

pub(super) fn tool(name: &str) -> Option<Tool> {
    (name == "search_media").then(|| SEARCH.tool.clone())
}

pub(super) fn is_search(name: &str) -> bool {
    name == "search_media"
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
        None,
    ));
    tool.annotations = Some(ToolAnnotations::new().read_only(true).destructive(false));
    SearchContract { tool }
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
}
