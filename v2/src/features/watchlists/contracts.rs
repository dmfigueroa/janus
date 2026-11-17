//! MCP output schemas shared by the batch-shaped tools.

use serde_json::{Value, json};

/// Output schema shared by `create_watchlists` and `update_watchlists`.
pub fn write_output_schema() -> serde_json::Map<String, Value> {
    let batch = json!({"type":"object","properties":{            "index":{"type":"integer","minimum":0},            "success":{"type":"boolean"},            "code":{"type":"string"},            "message":{"type":"string"},            "watchlistId":{"type":"number"},            "watchlist":{"type":"object","properties":{"id":{"type":"number"},"name":{"type":"string"},"description":{"type":["string","null"]},"itemOrderMode":{"type":"string","enum":["release","custom"]}},"required":["id","name","description","itemOrderMode"]}        },"required":["index","success","code","message"]});
    serde_json::Map::from_iter([
        ("type".into(), json!("object")),
        (
            "properties".into(),
            json!({"results":{"type":"array","items":batch}}),
        ),
        ("required".into(), json!(["results"])),
    ])
}
