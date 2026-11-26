//! MCP adapter: tool routing and protocol envelopes.

use super::Watchlists;
use crate::integrations::tmdb::TmdbCatalog;
use rmcp::{ErrorData, RoleServer, ServerHandler, model::*, service::RequestContext};
use serde_json::{Map, Value};
use std::sync::Arc;

mod batched;
mod media;
mod paged;

#[cfg(test)]
mod contract_check;

#[derive(Clone)]
pub struct WatchlistMcp {
    lists: Watchlists,
    catalog: Arc<dyn TmdbCatalog>,
}

impl WatchlistMcp {
    pub fn new(lists: Watchlists, catalog: Arc<dyn TmdbCatalog>) -> Self {
        Self { lists, catalog }
    }
}

pub(super) enum McpCallError {
    InvalidRequest(String),
    Failure(String),
}

enum Route {
    Paged(&'static paged::Contract),
    Batched(&'static batched::Contract),
    Search,
}

pub(super) fn object_schema(properties: Value, required: Value) -> Map<String, Value> {
    Map::from_iter([
        ("type".into(), Value::from("object")),
        ("properties".into(), properties),
        ("required".into(), required),
    ])
}

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
    paged::tools()
        .into_iter()
        .chain(media::tools())
        .chain(batched::tools())
        .collect()
}

fn tool(name: &str) -> Option<Tool> {
    paged::tool(name)
        .or_else(|| media::tool(name))
        .or_else(|| batched::tool(name))
}

fn route(name: &str) -> Option<Route> {
    if media::is_search(name) {
        return Some(Route::Search);
    }
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
        Err(McpCallError::InvalidRequest(message) | McpCallError::Failure(message)) => {
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
            Route::Paged(contract) => paged::call(&self.lists, contract, arguments).await,
            Route::Batched(contract) => batched::call(&self.lists, contract, arguments).await,
            Route::Search => media::call_search(self.catalog.as_ref(), arguments).await,
        };
        envelope(called)
    }
}
