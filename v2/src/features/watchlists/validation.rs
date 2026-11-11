use serde_json::{Value, json};

/// Match v1's per-tool input shape before selecting a domain operation.
/// Unknown top-level properties are stripped by v1's registered Zod shapes.
pub fn arguments(name: &str, mut arguments: Value) -> Result<Value, String> {
    let fields: &[&str] = match name {
        "list_watchlists" => &["orderBy", "order", "pageSize", "cursor"],
        "search_watchlists" => &["query", "orderBy", "order", "pageSize", "cursor"],
        "get_watchlist" => &["watchlistId", "pageSize", "cursor", "resultView"],
        "find_watchlist_items" => &[
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
        _ => return Err("Unknown tool.".into()),
    };
    let object = arguments.as_object_mut().ok_or("Invalid tool arguments.")?;
    object.retain(|key, _| fields.contains(&key.as_str()));
    for key in [
        "orderBy",
        "order",
        "cursor",
        "resultView",
        "provider",
        "providerId",
        "mediaType",
        "query",
    ] {
        if object.get(key).is_some_and(|value| !value.is_string()) {
            return Err(format!("Invalid {key}."));
        }
    }
    for (key, options) in [
        ("orderBy", &["createdAt", "lastWatched", "lastAdded"][..]),
        ("order", &["asc", "desc"][..]),
        ("resultView", &["items", "titles"][..]),
        (
            "mediaType",
            &[
                "movie", "episode", "game", "book", "comic", "anime", "manga",
            ][..],
        ),
    ] {
        if object
            .get(key)
            .is_some_and(|value| !options.contains(&value.as_str().unwrap()))
        {
            return Err(format!("Invalid {key}."));
        }
    }
    for key in ["query", "provider", "providerId"] {
        if let Some(value) = object.get_mut(key) {
            let text = value.as_str().unwrap().trim().to_owned();
            if text.is_empty() {
                return Err(format!("Invalid {key}."));
            }
            *value = json!(text);
        }
    }
    if name == "get_watchlist"
        && let Some(value) = object.get_mut("watchlistId")
    {
        let id = value.as_i64().or_else(|| {
            value
                .as_str()
                .and_then(|text| text.trim().parse::<i64>().ok())
        });
        if let Some(id) = id {
            *value = json!(id);
        }
    }
    for key in ["watchlistId", "watchlistItemId", "pageSize"] {
        if let Some(value) = object.get(key) {
            let number = value
                .as_u64()
                .filter(|number| *number > 0 && (key != "pageSize" || *number <= 100));
            if number.is_none() {
                return Err(format!("Invalid {key}."));
            }
        }
    }
    if name == "search_watchlists" && !object.contains_key("query") {
        return Err("A search query is required.".into());
    }
    if ["get_watchlist", "find_watchlist_items"].contains(&name)
        && !object.contains_key("watchlistId")
    {
        return Err("Invalid watchlist ID.".into());
    }
    if name == "find_watchlist_items" {
        let selectors = [
            object.contains_key("watchlistItemId"),
            ["provider", "providerId", "mediaType"]
                .iter()
                .any(|key| object.contains_key(*key)),
            object.contains_key("query"),
        ];
        let invalid = selectors.iter().filter(|selected| **selected).count() != 1
            || (selectors[1]
                && ["provider", "providerId", "mediaType"]
                    .iter()
                    .any(|key| !object.contains_key(*key)))
            || ((selectors[0] || selectors[1])
                && ["pageSize", "cursor"]
                    .iter()
                    .any(|key| object.contains_key(*key)));
        if invalid {
            return Err("Provide one valid watchlist item selector.".into());
        }
    }
    Ok(arguments)
}
