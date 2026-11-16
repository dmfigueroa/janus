use serde_json::{Value, json};
pub fn output_schema(name: &str) -> serde_json::Map<String, Value> {
    let nullable_string = json!({"type":["string","null"]});
    let media = json!({"type":"string","enum": super::discovery::MEDIA_TYPES});
    let item = json!({"type":"object","properties":{"id":{"type":"number"},"watchlistId":{"type":"number"},"provider":{"type":"string"},"providerId":{"type":"string"},"mediaType":media,"title":{"type":"string"},"parent":{"type":"object","properties":{"providerId":nullable_string,"title":nullable_string},"required":["providerId","title"]},"episode":nullable_string,"isWatched":{"type":["boolean","null"]}},"required":["id","watchlistId","provider","providerId","mediaType","title","parent","episode","isWatched"]});
    let title = json!({"type":"object","properties":{"provider":{"type":"string"},"providerId":{"type":"string"},"mediaType":media,"title":{"type":"string"},"matchingItemCount":{"type":"number"}},"required":["provider","providerId","mediaType","title","matchingItemCount"]});
    let summary = json!({"type":"object","properties":{"id":{"type":"number"},"name":{"type":"string"},"description":nullable_string,"itemOrderMode":{"type":"string","enum":["release","custom"]},"createdAt":{"type":"string"},"updatedAt":nullable_string,"lastWatchedAt":nullable_string,"lastItemAddedAt":nullable_string,"pausedAt":nullable_string,"stats":{"type":"object","properties":{"totalItems":{"type":"number"},"watchedItems":{"type":"number"},"progress":{"type":"number"},"nextUnwatched":{},"coverImage":nullable_string,"coverMediaType":{"anyOf":[media,{"type":"null"}]}},"required":["totalItems","watchedItems","progress","nextUnwatched","coverImage","coverMediaType"]}},"required":["id","name","description","itemOrderMode","createdAt","updatedAt","lastWatchedAt","lastItemAddedAt","pausedAt","stats"]});
    if name == "list_watchlists" || name == "search_watchlists" {
        return serde_json::Map::from_iter([
            ("type".into(), json!("object")),
            (
                "properties".into(),
                json!({"watchlists":{"type":"array","items":summary},"nextCursor":{"type":"string"}}),
            ),
            ("required".into(), json!(["watchlists"])),
        ]);
    }
    let mut properties = json!({"items":{"type":"array","items":item},"titles":{"type":"array","items":title},"nextCursor":{"type":"string"}});
    let mut output = serde_json::Map::from_iter([("type".into(), json!("object"))]);
    if name == "get_watchlist" {
        properties["watchlist"] = summary;
        properties["orderToken"] = json!({"type":"string"});
        output.insert("required".into(), json!(["watchlist"]));
    }
    output.insert("properties".into(), properties);
    output
}
