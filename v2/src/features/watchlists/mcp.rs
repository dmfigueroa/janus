use super::Watchlists;
use rmcp::{ErrorData, RoleServer, ServerHandler, model::*, service::RequestContext};
use serde_json::{Value, json};
#[derive(Clone)]
pub struct ReadMcp(pub Watchlists);
fn definitions() -> Vec<Tool> {
    let media =
        json!({"type":"string","enum":["movie","episode","game","book","comic","anime","manga"]});
    let mut page = json!({"orderBy":{"type":"string","enum":["createdAt","lastWatched","lastAdded"]},"order":{"type":"string","enum":["asc","desc"]},"pageSize":{"type":"integer","minimum":1,"maximum":100},"cursor":{"type":"string"}});
    let list = page.clone();
    page["query"] = json!({"type":"string","minLength":1});
    let detail = json!({"watchlistId":{"type":"integer","minimum":1},"pageSize":{"type":"integer","minimum":1,"maximum":100},"cursor":{"type":"string"},"resultView":{"type":"string","enum":["items","titles"]}});
    let mut find = detail.clone();
    find["watchlistItemId"] = json!({"type":"integer","minimum":1});
    find["provider"] = json!({"type":"string","minLength":1});
    find["providerId"] = json!({"type":"string","minLength":1});
    find["mediaType"] = media;
    find["query"] = json!({"type":"string","minLength":1});
    [
        ("list_watchlists", "List watchlists", list, vec![]),
        (
            "search_watchlists",
            "Search watchlists",
            page,
            vec!["query"],
        ),
        (
            "get_watchlist",
            "Get watchlist",
            detail,
            vec!["watchlistId"],
        ),
        (
            "find_watchlist_items",
            "Find watchlist items",
            find,
            vec!["watchlistId"],
        ),
    ]
    .into_iter()
    .map(|(name, title, properties, required)| {
        let mut tool = Tool::new(
            name,
            title,
            json!({"type":"object","properties":properties,"required":required})
                .as_object()
                .unwrap()
                .clone(),
        );
        tool.title = Some(title.into());
        tool.output_schema = Some(std::sync::Arc::new(
            super::contracts::output_schema(name)
                .as_object()
                .unwrap()
                .clone(),
        ));
        tool.annotations = Some(ToolAnnotations::new().read_only(true).destructive(false));
        tool
    })
    .collect()
}
impl ServerHandler for ReadMcp {
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
            tools: definitions(),
            ..Default::default()
        })
    }
    fn get_tool(&self, name: &str) -> Option<Tool> {
        definitions().into_iter().find(|tool| tool.name == name)
    }
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        if self.get_tool(&request.name).is_none() {
            return Err(ErrorData::method_not_found::<CallToolRequestMethod>());
        }
        match self
            .0
            .discover(
                &request.name,
                Value::Object(request.arguments.unwrap_or_default()),
            )
            .await
        {
            Ok(data) => {
                let mut result = CallToolResult::structured(data);
                result.result_type = None;
                result.is_error = None;
                Ok(result.into())
            }
            Err(message) => {
                let mut result = CallToolResult::error(vec![ContentBlock::text(message)]);
                result.result_type = None;
                Ok(result.into())
            }
        }
    }
}
