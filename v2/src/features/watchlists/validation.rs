use super::discovery::DiscoveryOperation;
use serde_json::{Value, json};

/// Authoritative discovery rules, shared by web and MCP callers.
pub fn arguments(operation: DiscoveryOperation, mut arguments: Value) -> Result<Value, String> {
    let object = arguments.as_object_mut().ok_or("Invalid tool arguments.")?;
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
    for key in ["watchlistId", "watchlistItemId", "pageSize"] {
        if let Some(value) = object.get_mut(key) {
            let number = value.as_f64();
            let number = number
                .filter(|number| {
                    number.is_finite()
                        && number.fract() == 0.0
                        && *number > 0.0
                        && *number < i64::MAX as f64
                        && (key != "pageSize" || *number <= 100.0)
                })
                .ok_or_else(|| format!("Invalid {key}."))?;
            *value = json!(number as i64);
        }
    }
    if operation == DiscoveryOperation::Search && !object.contains_key("query") {
        return Err("A search query is required.".into());
    }
    if matches!(
        operation,
        DiscoveryOperation::Get | DiscoveryOperation::Find
    ) && !object.contains_key("watchlistId")
    {
        return Err("Invalid watchlist ID.".into());
    }
    if operation == DiscoveryOperation::Find {
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
