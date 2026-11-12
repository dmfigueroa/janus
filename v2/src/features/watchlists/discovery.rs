use super::{Watchlists, mcp_item};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::{Value, json};
use unicode_normalization::UnicodeNormalization;

fn invalid(message: &str) -> String {
    message.into()
}
fn offset(arguments: &Value, binding: &Value) -> Result<usize, String> {
    let Some(cursor) = arguments.get("cursor") else {
        return Ok(0);
    };
    let decoded = URL_SAFE_NO_PAD
        .decode(cursor.as_str().ok_or_else(|| invalid("Invalid cursor."))?)
        .map_err(|_| invalid("Invalid cursor."))?;
    let cursor: Value = serde_json::from_slice(&decoded).map_err(|_| invalid("Invalid cursor."))?;
    let mut cursor_binding = cursor.clone();
    let Some(object) = cursor_binding.as_object_mut() else {
        return Err(invalid("Invalid cursor."));
    };
    object.remove("offset");
    if cursor_binding != *binding {
        return Err(invalid("Invalid cursor."));
    }
    cursor["offset"]
        .as_u64()
        .and_then(|offset| usize::try_from(offset).ok())
        .ok_or_else(|| invalid("Invalid cursor."))
}
fn paginate(
    values: Vec<Value>,
    arguments: &Value,
    binding: Value,
    key: &str,
) -> Result<Value, String> {
    let size = arguments["pageSize"].as_u64().unwrap_or(50) as usize;
    let offset = offset(arguments, &binding)?;
    let has_more = values.len().saturating_sub(offset) > size;
    let page: Vec<Value> = values.into_iter().skip(offset).take(size).collect();
    let mut result = json!({key:page});
    if has_more {
        let mut cursor = binding;
        cursor["offset"] = json!(offset + size);
        result["nextCursor"] = json!(URL_SAFE_NO_PAD.encode(serde_json::to_vec(&cursor).unwrap()));
    }
    Ok(result)
}
fn size(arguments: &Value) -> Value {
    arguments.get("pageSize").cloned().unwrap_or(json!(50))
}
fn folded(value: &str) -> String {
    value.nfc().collect::<String>().to_lowercase()
}
fn matches(item: &Value, query: &str) -> bool {
    ["title", "parentTitle", "episode"].iter().any(|key| {
        item[key]
            .as_str()
            .unwrap_or("")
            .to_ascii_lowercase()
            .contains(&query.to_ascii_lowercase())
    })
}
fn titles(items: &[Value]) -> Vec<Value> {
    let mut grouped = std::collections::BTreeMap::<(String, String, String, String), usize>::new();
    for item in items {
        let source = item["source"].as_str().unwrap().to_owned();
        let id = item["parentId"]
            .as_str()
            .or(item["tmdbId"].as_str())
            .unwrap()
            .to_owned();
        let title = item["parentTitle"]
            .as_str()
            .or(item["title"].as_str())
            .unwrap()
            .to_owned();
        *grouped
            .entry((
                title,
                id,
                source,
                item["mediaType"].as_str().unwrap().into(),
            ))
            .or_default() += 1;
    }
    grouped.into_iter().map(|((title,id,source,media),count)|json!({"provider":source,"providerId":id,"mediaType":media,"title":title,"matchingItemCount":count})).collect()
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DiscoveryOperation {
    List,
    Search,
    Get,
    Find,
}

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watchlist_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watchlist_item_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_view: Option<String>,
}

#[derive(Debug)]
pub enum DiscoveryError {
    InvalidInput(String),
    Database(sea_orm::DbErr),
}
impl From<String> for DiscoveryError {
    fn from(message: String) -> Self {
        Self::InvalidInput(message)
    }
}
impl std::fmt::Display for DiscoveryError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput(message) => formatter.write_str(message),
            Self::Database(error) => write!(formatter, "{error}"),
        }
    }
}
impl Watchlists {
    pub async fn discovery(
        &self,
        operation: DiscoveryOperation,
        request: DiscoveryRequest,
    ) -> Result<Value, DiscoveryError> {
        self.discover_arguments(operation, serde_json::to_value(request).unwrap())
            .await
    }
    pub(super) async fn discover_arguments(
        &self,
        operation: DiscoveryOperation,
        arguments: Value,
    ) -> Result<Value, DiscoveryError> {
        let arguments = super::validation::arguments(operation, arguments)?;
        if matches!(
            operation,
            DiscoveryOperation::List | DiscoveryOperation::Search
        ) {
            return self.summaries(operation, arguments).await;
        }
        let id = arguments["watchlistId"].as_i64().unwrap();
        let data = self.detail(id).await.map_err(DiscoveryError::Database)?;
        let Some(data) = data else {
            if operation == DiscoveryOperation::Find
                && (arguments.get("watchlistItemId").is_some()
                    || arguments.get("provider").is_some())
            {
                return Ok(json!({arguments["resultView"].as_str().unwrap_or("items"):[]}));
            }
            return Err(invalid(&format!("Watchlist {id} was not found.")).into());
        };
        let view = arguments["resultView"].as_str().unwrap_or("items");
        let all = data["items"].as_array().unwrap();
        let mut selected = all.clone();
        let mut exact = false;
        if operation == DiscoveryOperation::Find {
            let selectors = [
                arguments.get("watchlistItemId").is_some(),
                arguments.get("provider").is_some()
                    || arguments.get("providerId").is_some()
                    || arguments.get("mediaType").is_some(),
                arguments.get("query").is_some(),
            ];
            if selectors[0] {
                let target = arguments["watchlistItemId"].as_i64().unwrap();
                selected.retain(|item| item["id"] == target);
                exact = true;
            } else if selectors[1] {
                selected.retain(|item| {
                    item["source"].as_str() == arguments["provider"].as_str().map(str::trim)
                        && item["tmdbId"].as_str()
                            == arguments["providerId"].as_str().map(str::trim)
                        && item["mediaType"] == arguments["mediaType"]
                });
                exact = true;
            } else {
                let query = arguments["query"].as_str().unwrap();
                selected.retain(|item| matches(item, query.trim()));
            }
        }
        let values = if view == "titles" {
            if exact {
                selected
                    .iter()
                    .map(|item| {
                        let mut title = titles(std::slice::from_ref(item));
                        title.remove(0)
                    })
                    .collect()
            } else {
                titles(&selected)
            }
        } else {
            selected.iter().map(mcp_item).collect()
        };
        let mut result = if exact {
            json!({view:values})
        } else {
            let mut binding = json!({"watchlistId":id,"pageSize":size(&arguments)});
            if let Some(query) = arguments.get("query") {
                binding["query"] = json!(query.as_str().unwrap_or("").trim());
            }
            if view == "titles" {
                binding["resultView"] = json!("titles");
            }
            paginate(values, &arguments, binding, view)?
        };
        if operation == DiscoveryOperation::Get {
            result["watchlist"] = data["watchlist"].clone();
            if view == "items" {
                result["orderToken"] = data["orderToken"].clone();
            }
        }
        Ok(result)
    }
    async fn summaries(
        &self,
        operation: DiscoveryOperation,
        arguments: Value,
    ) -> Result<Value, DiscoveryError> {
        let order_by = arguments["orderBy"].as_str().unwrap_or("createdAt");
        let order = arguments["order"].as_str().unwrap_or("desc");
        let query = if operation == DiscoveryOperation::Search {
            Some(folded(arguments["query"].as_str().unwrap().trim()))
        } else {
            None
        };
        let mut summaries: Vec<Value> = self
            .headers()
            .await
            .map_err(DiscoveryError::Database)?
            .into_iter()
            .filter(|list| {
                query
                    .as_ref()
                    .is_none_or(|query| folded(list["name"].as_str().unwrap()).contains(query))
            })
            .collect();
        let key = match order_by {
            "lastWatched" => "lastWatchedAt",
            "lastAdded" => "lastItemAddedAt",
            _ => "createdAt",
        };
        summaries.sort_by(|left, right| {
            let value = |list: &Value| {
                list[key]
                    .as_str()
                    .or_else(|| {
                        if key == "lastItemAddedAt" {
                            list["createdAt"].as_str()
                        } else {
                            None
                        }
                    })
                    .map(str::to_owned)
            };
            let compared = value(left)
                .cmp(&value(right))
                .then_with(|| left["id"].as_i64().cmp(&right["id"].as_i64()));
            if order == "desc" {
                compared.reverse()
            } else {
                compared
            }
        });
        let mut binding = json!({"orderBy":order_by,"order":order});
        if let Some(query) = query {
            binding["searchQuery"] = json!(query);
        }
        let mut page = paginate(summaries, &arguments, binding, "watchlists")?;
        let mut summaries = Vec::new();
        for header in page["watchlists"].as_array().unwrap() {
            if let Some(summary) = self
                .summary(header["id"].as_i64().unwrap())
                .await
                .map_err(DiscoveryError::Database)?
            {
                summaries.push(summary);
            }
        }
        page["watchlists"] = json!(summaries);
        Ok(page)
    }
}
