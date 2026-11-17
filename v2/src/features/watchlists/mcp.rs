//! MCP adapter: routing, legacy batch normalization and protocol envelopes.
//!
//! Page-shaped contracts own their declarations, accepted fields, schemas and
//! projections. The batch-shaped tools still live in this adapter; they keep
//! v1's legacy coercion, unknown-field handling and JSON envelopes.

use super::{Watchlists, contracts};
use rmcp::{ErrorData, RoleServer, ServerHandler, model::*, service::RequestContext};
use serde_json::{Map, Value, json};
use std::sync::Arc;

mod paged;

#[cfg(test)]
mod contract_check;

#[derive(Clone)]
pub struct WatchlistMcp(pub Watchlists);

/// One MCP tool's declaration, accepted argument fields and output schema.
///
/// The declaration, the fields accepted at call time and the schema describing
/// the projection are built from one entry so they cannot drift apart.
pub(super) struct ToolContract {
    pub(super) name: &'static str,
    pub(super) tool: Tool,
    pub(super) accepted: &'static [&'static str],
}

/// A whole-request outcome the adapter turns into the protocol envelope.
///
/// Per-entry failures inside a batch are data in the returned value, never one
/// of these variants: they must not abort the remaining entries.
pub(super) enum McpCallError {
    /// Failed at the tool level; surfaces as error content.
    Failure(String),
}

/// Builds an object-valued JSON schema, as tool declarations use.
pub(super) fn object_schema(properties: Value, required: Value) -> Map<String, Value> {
    Map::from_iter([
        ("type".into(), Value::from("object")),
        ("properties".into(), properties),
        ("required".into(), required),
    ])
}

/// Builds an object-schema output declaration with an optional `required` list.
pub(super) fn output_schema(properties: Value, required: Option<Value>) -> Arc<Map<String, Value>> {
    let mut schema = Map::from_iter([
        ("type".into(), Value::from("object")),
        ("properties".into(), properties),
    ]);
    if let Some(required) = required {
        schema.insert("required".into(), required);
    }
    Arc::new(schema)
}

fn batch_definitions() -> Vec<Tool> {
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
    reorder.output_schema = Some(output_schema(
        json!({"results":{"type":"array","items":{"type":"object","properties":{"index":{"type":"integer","minimum":0},"success":{"type":"boolean"},"code":{"type":"string"},"message":{"type":"string"},"watchlistId":{"type":"number"},"movedItemId":{"type":"number"},"referenceItemId":{"type":"number"}},"required":["index","success","code","message"]}}}),
        Some(json!(["results"])),
    ));
    reorder.annotations = Some(
        ToolAnnotations::new()
            .read_only(false)
            .destructive(true)
            .idempotent(false),
    );
    let mut create = Tool::new(
        "create_watchlists",
        "Create watchlists",
        object_schema(
            json!({"watchlists":{"type":"array","minItems":1,"items":{"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"},"itemOrderMode":{"type":"string","enum":["release","custom"]}}}}}),
            json!(["watchlists"]),
        ),
    );
    create.title = Some("Create watchlists".into());
    create.description = Some("Create one or more watchlists. Each requested watchlist is processed independently and returns an ordered result.".into());
    create.output_schema = Some(Arc::new(contracts::write_output_schema()));
    create.annotations = Some(ToolAnnotations::new().read_only(false).destructive(false));
    let mut update = Tool::new(
        "update_watchlists",
        "Update watchlists",
        object_schema(
            json!({"watchlists":{"type":"array","minItems":1,"items":{"type":"object","properties":{"watchlistId":{"type":"number"},"name":{"type":"string"},"description":{"type":["string","null"]},"itemOrderMode":{"type":"string","enum":["release","custom"]}}}}}),
            json!(["watchlists"]),
        ),
    );
    update.title = Some("Update watchlists".into());
    update.description = Some("Update one or more watchlists. Each requested watchlist is processed independently and returns an ordered result. Omit a field to keep its existing value; use null or an empty string only to clear the description. Name cannot be cleared, and each update must include at least one field to update.".into());
    update.output_schema = Some(Arc::new(contracts::write_output_schema()));
    update.annotations = Some(ToolAnnotations::new().read_only(false).destructive(false));
    vec![reorder, create, update]
}

impl ServerHandler for WatchlistMcp {
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
            tools: paged::tools()
                .into_iter()
                .chain(batch_definitions())
                .collect(),
            ..Default::default()
        })
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        paged::tool(name).or_else(|| {
            batch_definitions()
                .into_iter()
                .find(|tool| tool.name == name)
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        if let Some(contract) = paged::contract(&request.name) {
            let arguments = request.arguments.unwrap_or_default();
            return envelope(paged::call(&self.0, contract, arguments).await);
        }
        if request.name == "create_watchlists" || request.name == "update_watchlists" {
            let arguments = Value::Object(request.arguments.unwrap_or_default());
            let Some(entries) = arguments
                .get("watchlists")
                .and_then(Value::as_array)
                .filter(|entries| !entries.is_empty())
            else {
                return Err(ErrorData::invalid_params(
                    "watchlists must be a non-empty array",
                    None,
                ));
            };
            let shaped = if request.name == "create_watchlists" {
                entries.iter().all(create_shape_is_valid)
            } else {
                entries.iter().all(update_shape_is_valid)
            };
            if !shaped {
                return Err(ErrorData::invalid_params("Invalid watchlist input", None));
            }
            let results = if request.name == "create_watchlists" {
                self.create_batch(entries).await
            } else {
                self.update_batch(entries).await
            };
            let mut response = CallToolResult::structured(json!({"results":results}));
            response.result_type = None;
            response.is_error = None;
            return Ok(response.into());
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
        Err(ErrorData::method_not_found::<CallToolRequestMethod>())
    }
}

impl WatchlistMcp {
    async fn create_batch(&self, entries: &[Value]) -> Vec<Value> {
        let mut results = Vec::new();
        for (index, entry) in entries.iter().enumerate() {
            let result = match create_input(entry) {
                Err(message) => validation_result(index, &message),
                Ok(input) => match self.0.create_watchlist(input).await {
                    Ok(watchlist) => json!({
                        "index": index,
                        "success": true,
                        "code": "created",
                        "message": "Watchlist created.",
                        "watchlist": {
                            "id": watchlist.id,
                            "name": watchlist.name,
                            "description": watchlist.description,
                            "itemOrderMode": watchlist.item_order_mode.as_str(),
                        },
                    }),
                    Err(error) => {
                        eprintln!("MCP create failed for batch entry {index}: {error}");
                        internal_error_result(index)
                    }
                },
            };
            results.push(result);
        }
        results
    }

    async fn update_batch(&self, entries: &[Value]) -> Vec<Value> {
        let mut results = Vec::new();
        for (index, entry) in entries.iter().enumerate() {
            let result = match update_input(entry) {
                Err(message) => update_validation_result(index, entry, &message),
                Ok(changes) => {
                    let watchlist_id = changes.watchlist_id;
                    match self.0.update_watchlist(changes).await {
                        Ok(super::write::UpdateOutcome::Updated) => json!({
                            "index": index,
                            "success": true,
                            "code": "updated",
                            "message": "Watchlist updated.",
                            "watchlistId": watchlist_id,
                        }),
                        Ok(super::write::UpdateOutcome::NotFound) => json!({
                            "index": index,
                            "success": false,
                            "code": "not_found",
                            "message": "Watchlist not found.",
                            "watchlistId": watchlist_id,
                        }),
                        Err(error) => {
                            eprintln!(
                                "MCP update failed for watchlist {watchlist_id}, batch entry {index}: {error}"
                            );
                            internal_error_result(index)
                        }
                    }
                }
            };
            results.push(result);
        }
        results
    }
}

/// Renders a page-shaped tool call into the protocol envelope v1 exposed.
fn envelope(called: Result<Value, McpCallError>) -> Result<CallToolResponse, ErrorData> {
    match called {
        Ok(data) => {
            let mut response = CallToolResult::structured(data);
            response.result_type = None;
            response.is_error = None;
            Ok(response.into())
        }
        Err(McpCallError::Failure(message)) => {
            let mut response = CallToolResult::error(vec![ContentBlock::text(message)]);
            response.result_type = None;
            Ok(response.into())
        }
    }
}

fn validation_result(index: usize, message: &str) -> Value {
    json!({
        "index": index,
        "success": false,
        "code": "validation_error",
        "message": message,
    })
}

fn update_validation_result(index: usize, entry: &Value, message: &str) -> Value {
    let mut result = validation_result(index, message);
    if let Some(watchlist_id) = entry.get("watchlistId").and_then(Value::as_i64) {
        result["watchlistId"] = json!(watchlist_id);
    }
    result
}

fn internal_error_result(index: usize) -> Value {
    json!({
        "index": index,
        "success": false,
        "code": "internal_error",
        "message": "The operation failed unexpectedly. Verify its state before retrying.",
    })
}

fn create_shape_is_valid(entry: &Value) -> bool {
    let Some(object) = entry.as_object() else {
        return false;
    };
    for key in ["name", "description"] {
        if object.get(key).is_some_and(|value| !value.is_string()) {
            return false;
        }
    }
    object
        .get("itemOrderMode")
        .is_none_or(|value| matches!(value.as_str(), Some("release" | "custom")))
}

fn update_shape_is_valid(entry: &Value) -> bool {
    let Some(object) = entry.as_object() else {
        return false;
    };
    if object
        .get("watchlistId")
        .is_some_and(|value| !value.is_number())
    {
        return false;
    }
    if object.get("name").is_some_and(|value| !value.is_string()) {
        return false;
    }
    if object
        .get("description")
        .is_some_and(|value| !value.is_string() && !value.is_null())
    {
        return false;
    }
    object
        .get("itemOrderMode")
        .is_none_or(|value| matches!(value.as_str(), Some("release" | "custom")))
}

fn type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn expected_string(value: &Value) -> String {
    format!("Expected string, received {}", type_name(value))
}

fn order_mode(value: &Value) -> Result<super::ItemOrderMode, String> {
    let Some(text) = value.as_str() else {
        return Err(expected_string(value));
    };
    super::ItemOrderMode::parse(text).ok_or_else(|| {
        format!("Invalid enum value. Expected 'release' | 'custom', received '{text}'")
    })
}

fn create_input(entry: &Value) -> Result<super::write::NewWatchlist, String> {
    let object = entry
        .as_object()
        .ok_or_else(|| format!("Expected object, received {}", type_name(entry)))?;
    let name = match object.get("name") {
        None | Some(Value::Null) => return Err("Name is required".into()),
        Some(Value::String(name)) if name.is_empty() => return Err("Name is required".into()),
        Some(Value::String(name)) => name.clone(),
        Some(value) => return Err(expected_string(value)),
    };
    let description = match object.get("description") {
        None => None,
        Some(Value::String(description)) => Some(description.clone()),
        Some(value) => return Err(expected_string(value)),
    };
    let item_order_mode = match object.get("itemOrderMode") {
        None => None,
        Some(value) => Some(order_mode(value)?),
    };
    Ok(super::write::NewWatchlist {
        name,
        description,
        item_order_mode,
    })
}

fn update_input(entry: &Value) -> Result<super::write::WatchlistChanges, String> {
    let object = entry
        .as_object()
        .ok_or_else(|| format!("Expected object, received {}", type_name(entry)))?;
    let watchlist_id = match object.get("watchlistId") {
        None => return Err("Required".into()),
        Some(Value::Number(number)) => number
            .as_i64()
            .ok_or_else(|| "Expected integer, received number".to_owned())?,
        Some(value) => return Err(format!("Expected number, received {}", type_name(value))),
    };
    if object.get("name").is_none()
        && object.get("description").is_none()
        && object.get("itemOrderMode").is_none()
    {
        return Err("No fields to update.".into());
    }
    let name = match object.get("name") {
        None => None,
        Some(Value::String(name)) if name.is_empty() => return Err("Name is required".into()),
        Some(Value::String(name)) => Some(name.clone()),
        Some(value) => return Err(expected_string(value)),
    };
    let description = match object.get("description") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(description)) => Some(Some(description.clone())),
        Some(value) => return Err(expected_string(value)),
    };
    let item_order_mode = match object.get("itemOrderMode") {
        None => None,
        Some(value) => Some(order_mode(value)?),
    };
    Ok(super::write::WatchlistChanges {
        watchlist_id,
        name,
        description,
        item_order_mode,
    })
}
