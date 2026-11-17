//! MCP batch contracts: tools whose results are ordered per-entry outcomes.
//!
//! Create, update and reorder each process their entries independently and
//! answer with one ordered result per entry. That contract — indexing, partial
//! failure, error codes and reference echoes — is shared here, while each tool
//! keeps its own declaration, accepted arguments, schema and entry rules.
//! Whole-request rejections happen before any entry runs and surface as
//! JSON-RPC invalid params.

use super::{McpCallError, ToolContract, object_schema, output_schema};
use crate::features::watchlists::{
    ItemOrderMode, Watchlists,
    reorder::{Reorder, ReorderOutcome},
    write::{NewWatchlist, UpdateOutcome, WatchlistChanges},
};
use rmcp::model::{Tool, ToolAnnotations};
use serde_json::{Map, Value, json};
use std::sync::{Arc, LazyLock};

const REORDER_FIELDS: &[&str] = &["reorders"];
const WRITE_FIELDS: &[&str] = &["watchlists"];

static CONTRACTS: LazyLock<Vec<ToolContract>> = LazyLock::new(build_contracts);

/// Declarations for every batch-shaped tool, in protocol listing order.
pub(super) fn tools() -> Vec<Tool> {
    CONTRACTS
        .iter()
        .map(|contract| contract.tool.clone())
        .collect()
}

/// One batch-shaped declaration, cloned only when the protocol asks for it.
pub(super) fn tool(name: &str) -> Option<Tool> {
    contract(name).map(|contract| contract.tool.clone())
}

/// The contract that owns this tool, when it is batch-shaped.
pub(super) fn contract(name: &str) -> Option<&'static ToolContract> {
    CONTRACTS.iter().find(|contract| contract.name == name)
}

/// Runs one batch-shaped tool call, one entry at a time.
pub(super) async fn call(
    lists: &Watchlists,
    contract: &ToolContract,
    arguments: Map<String, Value>,
) -> Result<Value, McpCallError> {
    let mut arguments = arguments;
    arguments.retain(|key, _| contract.accepted.contains(&key.as_str()));
    match contract.name {
        "create_watchlists" => {
            let entries = entries(
                &arguments,
                "watchlists",
                "watchlists must be a non-empty array",
            )?;
            if !entries.iter().all(create_shape_is_valid) {
                return Err(McpCallError::InvalidRequest(
                    "Invalid watchlist input".into(),
                ));
            }
            Ok(run_batch(lists, BatchTool::Create, entries).await)
        }
        "update_watchlists" => {
            let entries = entries(
                &arguments,
                "watchlists",
                "watchlists must be a non-empty array",
            )?;
            if !entries.iter().all(update_shape_is_valid) {
                return Err(McpCallError::InvalidRequest(
                    "Invalid watchlist input".into(),
                ));
            }
            Ok(run_batch(lists, BatchTool::Update, entries).await)
        }
        "reorder_watchlist_items" => {
            let entries = entries(&arguments, "reorders", "reorders must be a non-empty array")?;
            if !entries.iter().all(reorder_shape_is_valid) {
                return Err(McpCallError::InvalidRequest("Invalid reorder input".into()));
            }
            Ok(run_batch(lists, BatchTool::Reorder, entries).await)
        }
        // `contract` only returns names declared here; routing checks membership first.
        _ => unreachable!("every batch contract has a call path"),
    }
}

/// The non-empty entry array a batch call requires.
fn entries<'a>(
    arguments: &'a Map<String, Value>,
    key: &str,
    message: &str,
) -> Result<&'a [Value], McpCallError> {
    arguments
        .get(key)
        .and_then(Value::as_array)
        .filter(|entries| !entries.is_empty())
        .map(Vec::as_slice)
        .ok_or_else(|| McpCallError::InvalidRequest(message.into()))
}

/// One entry's outcome, before the shared renderer adds its position.
struct BatchEntry {
    success: bool,
    code: &'static str,
    message: String,
    fields: Vec<(&'static str, Value)>,
}

impl BatchEntry {
    fn done(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            success: true,
            code,
            message: message.into(),
            fields: Vec::new(),
        }
    }

    fn failed(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            success: false,
            code,
            message: message.into(),
            fields: Vec::new(),
        }
    }

    /// Adds a field the entry echoes back, such as a watchlist or item ID.
    fn with(mut self, key: &'static str, value: Value) -> Self {
        self.fields.push((key, value));
        self
    }
}

/// The closed set of batch tools, each with its own per-entry rules.
#[derive(Clone, Copy)]
enum BatchTool {
    Create,
    Update,
    Reorder,
}

/// Runs every entry in order and renders the ordered `results` envelope.
async fn run_batch(lists: &Watchlists, tool: BatchTool, entries: &[Value]) -> Value {
    let mut results = Vec::with_capacity(entries.len());
    for (index, entry) in entries.iter().cloned().enumerate() {
        let outcome = match tool {
            BatchTool::Create => create_entry(lists, entry, index).await,
            BatchTool::Update => update_entry(lists, entry, index).await,
            BatchTool::Reorder => reorder_entry(lists, entry, index).await,
        };
        results.push(outcome);
    }
    render(results)
}

fn render(entries: Vec<BatchEntry>) -> Value {
    let results = entries
        .into_iter()
        .enumerate()
        .map(|(index, entry)| {
            let mut result = json!({
                "index": index,
                "success": entry.success,
                "code": entry.code,
                "message": entry.message,
            });
            for (key, value) in entry.fields {
                result[key] = value;
            }
            result
        })
        .collect::<Vec<_>>();
    json!({"results": results})
}

fn internal_error() -> BatchEntry {
    BatchEntry::failed(
        "internal_error",
        "The operation failed unexpectedly. Verify its state before retrying.",
    )
}

async fn create_entry(lists: &Watchlists, entry: Value, index: usize) -> BatchEntry {
    let input = match create_input(&entry) {
        Ok(input) => input,
        Err(message) => return BatchEntry::failed("validation_error", message),
    };
    match lists.create_watchlist(input).await {
        Ok(watchlist) => BatchEntry::done("created", "Watchlist created.").with(
            "watchlist",
            json!({
                "id": watchlist.id,
                "name": watchlist.name,
                "description": watchlist.description,
                "itemOrderMode": watchlist.item_order_mode.as_str(),
            }),
        ),
        Err(error) => {
            eprintln!("MCP create failed for batch entry {index}: {error}");
            internal_error()
        }
    }
}

async fn update_entry(lists: &Watchlists, entry: Value, index: usize) -> BatchEntry {
    let changes = match update_input(&entry) {
        Ok(changes) => changes,
        Err(message) => {
            return match entry.get("watchlistId").and_then(Value::as_i64) {
                Some(watchlist_id) => BatchEntry::failed("validation_error", message)
                    .with("watchlistId", json!(watchlist_id)),
                None => BatchEntry::failed("validation_error", message),
            };
        }
    };
    let watchlist_id = changes.watchlist_id;
    match lists.update_watchlist(changes).await {
        Ok(UpdateOutcome::Updated) => BatchEntry::done("updated", "Watchlist updated.")
            .with("watchlistId", json!(watchlist_id)),
        Ok(UpdateOutcome::NotFound) => BatchEntry::failed("not_found", "Watchlist not found.")
            .with("watchlistId", json!(watchlist_id)),
        Err(error) => {
            eprintln!(
                "MCP update failed for watchlist {watchlist_id}, batch entry {index}: {error}"
            );
            internal_error()
        }
    }
}

async fn reorder_entry(lists: &Watchlists, entry: Value, index: usize) -> BatchEntry {
    let outcome = match (
        entry.get("watchlistId").and_then(Value::as_i64),
        serde_json::from_value::<Reorder>(entry.clone()),
    ) {
        (Some(watchlist_id), Ok(reorder)) => match lists.reorder(watchlist_id, reorder).await {
            Ok(ReorderOutcome::Reordered) => {
                BatchEntry::done("reordered", "Watchlist items reordered.")
            }
            Ok(ReorderOutcome::Rejected(failure)) => {
                BatchEntry::failed(failure.code(), failure.message())
            }
            Err(error) => {
                eprintln!(
                    "MCP reorder failed for watchlist {watchlist_id}, batch entry {index}: {error}"
                );
                BatchEntry::failed("internal_error", "Unable to reorder watchlist items.")
            }
        },
        _ => BatchEntry::failed(
            "validation_error",
            "watchlistId, movedItemId, referenceItemId, and position are required.",
        ),
    };
    ["watchlistId", "movedItemId", "referenceItemId"]
        .into_iter()
        .filter_map(|key| entry.get(key).map(|value| (key, value.clone())))
        .fold(outcome, |entry, (key, value)| entry.with(key, value))
}

/// Builds the ordered-batch output schema shared by create and update.
fn write_output_schema() -> Arc<Map<String, Value>> {
    let batch = json!({"type":"object","properties":{"index":{"type":"integer","minimum":0},"success":{"type":"boolean"},"code":{"type":"string"},"message":{"type":"string"},"watchlistId":{"type":"number"},"watchlist":{"type":"object","properties":{"id":{"type":"number"},"name":{"type":"string"},"description":{"type":["string","null"]},"itemOrderMode":{"type":"string","enum":["release","custom"]}},"required":["id","name","description","itemOrderMode"]}},"required":["index","success","code","message"]});
    output_schema(
        json!({"results":{"type":"array","items":batch}}),
        Some(json!(["results"])),
    )
}

fn build_contracts() -> Vec<ToolContract> {
    let write_schema = write_output_schema();

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
    create.output_schema = Some(write_schema.clone());
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
    update.output_schema = Some(write_schema);
    update.annotations = Some(ToolAnnotations::new().read_only(false).destructive(false));

    vec![
        ToolContract {
            name: "reorder_watchlist_items",
            tool: reorder,
            accepted: REORDER_FIELDS,
        },
        ToolContract {
            name: "create_watchlists",
            tool: create,
            accepted: WRITE_FIELDS,
        },
        ToolContract {
            name: "update_watchlists",
            tool: update,
            accepted: WRITE_FIELDS,
        },
    ]
}

/// Rejects entries whose present fields carry the wrong JSON type.
///
/// Missing fields are per-entry validation failures, not whole-request ones.
fn reorder_shape_is_valid(entry: &Value) -> bool {
    entry.is_object()
        && !["watchlistId", "movedItemId", "referenceItemId"]
            .iter()
            .any(|key| {
                entry
                    .get(*key)
                    .is_some_and(|value| value.as_i64().is_none())
            })
        && entry
            .get("position")
            .is_none_or(|value| matches!(value.as_str(), Some("before" | "after")))
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

fn order_mode(value: &Value) -> Result<ItemOrderMode, String> {
    let Some(text) = value.as_str() else {
        return Err(expected_string(value));
    };
    ItemOrderMode::parse(text).ok_or_else(|| {
        format!("Invalid enum value. Expected 'release' | 'custom', received '{text}'")
    })
}

fn create_input(entry: &Value) -> Result<NewWatchlist, String> {
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
    Ok(NewWatchlist {
        name,
        description,
        item_order_mode,
    })
}

fn update_input(entry: &Value) -> Result<WatchlistChanges, String> {
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
    Ok(WatchlistChanges {
        watchlist_id,
        name,
        description,
        item_order_mode,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::watchlists::mcp::contract_check::{
        assert_accepted_matches_declared, assert_output_matches,
    };

    fn batch_contract(name: &str) -> &'static ToolContract {
        contract(name).unwrap_or_else(|| panic!("{name} is not a batch contract"))
    }

    fn created() -> BatchEntry {
        BatchEntry::done("created", "Watchlist created.").with(
            "watchlist",
            json!({"id": 1, "name": "Shows", "description": null, "itemOrderMode": "release"}),
        )
    }

    #[test]
    fn every_batch_contract_accepts_exactly_its_declared_fields() {
        for contract in CONTRACTS.iter() {
            assert_accepted_matches_declared(contract);
        }
    }

    #[test]
    fn write_results_satisfy_the_shared_batch_schema() {
        let rendered = render(vec![
            created(),
            BatchEntry::done("updated", "Watchlist updated.").with("watchlistId", json!(1)),
            BatchEntry::failed("not_found", "Watchlist not found.").with("watchlistId", json!(9)),
            BatchEntry::failed("validation_error", "Name is required"),
            internal_error(),
        ]);
        assert_output_matches(batch_contract("create_watchlists"), &rendered);
        assert_output_matches(batch_contract("update_watchlists"), &rendered);
    }

    #[test]
    fn reorder_results_satisfy_the_reorder_schema() {
        let rendered = render(vec![
            BatchEntry::done("reordered", "Watchlist items reordered.")
                .with("watchlistId", json!(1))
                .with("movedItemId", json!(2))
                .with("referenceItemId", json!(3)),
            BatchEntry::failed("not_found", "Watchlist not found."),
        ]);
        assert_output_matches(batch_contract("reorder_watchlist_items"), &rendered);
    }

    #[test]
    fn render_keeps_entry_order_and_positions() {
        let rendered = render(vec![
            BatchEntry::failed("validation_error", "First"),
            BatchEntry::done("created", "Second"),
        ]);
        let results = rendered["results"].as_array().unwrap();
        assert_eq!(results[0]["index"], 0);
        assert_eq!(results[0]["message"], "First");
        assert_eq!(results[1]["index"], 1);
        assert_eq!(results[1]["code"], "created");
    }
}
