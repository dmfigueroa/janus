//! MCP adapter: tool routing and protocol envelopes.
//!
//! The page and batch contract modules own their tool declarations, accepted
//! arguments, output schemas and projections. This adapter owns only what the
//! transport and v1's observable protocol require: routing a call to its
//! contract family, mapping whole-request rejections to JSON-RPC errors, and the
//! response envelope quirks existing clients see.

use super::Watchlists;
use rmcp::{ErrorData, RoleServer, ServerHandler, model::*, service::RequestContext};
use serde_json::{Map, Value};
use std::sync::Arc;

mod batched;
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
    /// Rejected before dispatch; surfaces as JSON-RPC invalid params.
    InvalidRequest(String),
    /// Failed at the tool level; surfaces as error content.
    Failure(String),
}

/// The contract family that owns a tool, for routing.
enum Route {
    Paged(&'static ToolContract),
    Batched(&'static ToolContract),
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

fn tools() -> Vec<Tool> {
    paged::tools().into_iter().chain(batched::tools()).collect()
}

fn tool(name: &str) -> Option<Tool> {
    paged::tool(name).or_else(|| batched::tool(name))
}

fn route(name: &str) -> Option<Route> {
    paged::contract(name)
        .map(Route::Paged)
        .or_else(|| batched::contract(name).map(Route::Batched))
}

/// Renders a tool call into the protocol envelope v1 exposed.
fn envelope(called: Result<Value, McpCallError>) -> Result<CallToolResponse, ErrorData> {
    match called {
        Ok(data) => {
            let mut response = CallToolResult::structured(data);
            response.result_type = None;
            response.is_error = None;
            Ok(response.into())
        }
        Err(McpCallError::InvalidRequest(message)) => Err(ErrorData::invalid_params(message, None)),
        Err(McpCallError::Failure(message)) => {
            let mut response = CallToolResult::error(vec![ContentBlock::text(message)]);
            response.result_type = None;
            Ok(response.into())
        }
    }
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
            tools: tools(),
            ..Default::default()
        })
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        tool(name)
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let Some(route) = route(&request.name) else {
            return Err(ErrorData::method_not_found::<CallToolRequestMethod>());
        };
        let arguments = request.arguments.unwrap_or_default();
        let called = match route {
            Route::Paged(contract) => paged::call(&self.0, contract, arguments).await,
            Route::Batched(contract) => batched::call(&self.0, contract, arguments).await,
        };
        envelope(called)
    }
}
