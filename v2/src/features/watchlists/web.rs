use super::Watchlists;
use super::timeline::{TimelineFilters, TimelineView};
use crate::http::{FormOrJson, ResponseFormat};
use askama::Template;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Html, Response},
};
use serde::{Deserialize, Serialize};
#[derive(Deserialize)]
pub struct Filters {
    #[serde(default)]
    query: String,
    #[serde(default = "default_unwatched")]
    unwatched: bool,
}
fn default_unwatched() -> bool {
    TimelineFilters::default().unwatched
}
impl Filters {
    fn timeline(self) -> TimelineFilters {
        TimelineFilters::new(self.query, self.unwatched)
    }
}
type Failure = (StatusCode, &'static str);
fn failure(error: impl std::fmt::Display) -> Failure {
    eprintln!("Watchlist read failed: {error}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "Unable to load watchlist. Please try again.",
    )
}
pub async fn detail(
    State(lists): State<Watchlists>,
    Path(id): Path<i64>,
    Query(filters): Query<Filters>,
) -> Result<Html<String>, Failure> {
    load_timeline(&lists, id, filters.timeline())
        .await?
        .render_page()
        .map(Html)
        .map_err(failure)
}

async fn load_timeline(
    lists: &Watchlists,
    id: i64,
    filters: TimelineFilters,
) -> Result<TimelineView, Failure> {
    let detail = lists
        .detail(id)
        .await
        .map_err(failure)?
        .ok_or((StatusCode::NOT_FOUND, "Watchlist not found"))?;
    Ok(TimelineView::new(&detail, &filters))
}

#[derive(Deserialize, Default)]
pub struct ListFilters {
    #[serde(default)]
    query: String,
    cursor: Option<String>,
}
#[derive(Template)]
#[template(path = "watchlists.html")]
struct ListPage {
    lists: Vec<ListRow>,
    query: String,
    next: String,
}
struct ListRow {
    id: i64,
    name: String,
    total: u64,
    watched: u64,
}
pub async fn list(
    State(lists): State<Watchlists>,
    Query(filters): Query<ListFilters>,
) -> Result<Html<String>, Failure> {
    use super::discovery::{DiscoveryError, DiscoveryOperation, DiscoveryRequest};
    let query = filters.query.trim();
    let operation = if query.is_empty() {
        DiscoveryOperation::List
    } else {
        DiscoveryOperation::Search
    };
    let page = lists
        .summaries(
            operation,
            DiscoveryRequest {
                query: (!query.is_empty()).then(|| query.to_owned()),
                cursor: filters.cursor,
                ..Default::default()
            },
        )
        .await
        .map_err(|error| match error {
            DiscoveryError::InvalidInput(_) => (
                StatusCode::BAD_REQUEST,
                "Unable to load this page. Return to /v2/watchlists and try again.",
            ),
            DiscoveryError::Database(error) => failure(error),
        })?;
    ListPage {
        lists: page
            .watchlists
            .iter()
            .map(|summary| ListRow {
                id: summary.watchlist.id,
                name: summary.watchlist.name.clone(),
                total: summary.stats.total_items as u64,
                watched: summary.stats.watched_items as u64,
            })
            .collect(),
        query: filters.query,
        next: page.next_cursor.unwrap_or_default(),
    }
    .render()
    .map(Html)
    .map_err(failure)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderRequest {
    moved_item_id: i64,
    reference_item_id: i64,
    position: String,
}
pub async fn reorder(
    State(lists): State<Watchlists>,
    Path(id): Path<i64>,
    Query(filters): Query<Filters>,
    format: ResponseFormat,
    FormOrJson(request): FormOrJson<ReorderRequest>,
) -> Result<Response, Failure> {
    let result = reorder_result(&lists, id, request).await;
    format
        .respond(&result, async {
            load_timeline(&lists, id, filters.timeline())
                .await?
                .render_fragment(result.message.unwrap_or("Order saved."))
                .map(Html)
                .map_err(failure)
        })
        .await
}

#[derive(Serialize)]
struct ReorderResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<&'static str>,
}
impl ReorderResponse {
    fn rejected(code: &'static str, message: &'static str) -> Self {
        Self {
            success: false,
            code: Some(code),
            message: Some(message),
        }
    }
}

async fn reorder_result(lists: &Watchlists, id: i64, request: ReorderRequest) -> ReorderResponse {
    use super::reorder::{Reorder, ReorderFailure, ReorderOutcome, ReorderPosition};
    if request.moved_item_id == request.reference_item_id {
        let failure = ReorderFailure::InvalidReorder;
        return ReorderResponse::rejected(failure.code(), failure.message());
    }
    let position = match request.position.as_str() {
        "before" => ReorderPosition::Before,
        "after" => ReorderPosition::After,
        _ => {
            return ReorderResponse::rejected("validation_error", "Invalid position");
        }
    };
    let input = Reorder {
        moved_item_id: request.moved_item_id,
        reference_item_id: request.reference_item_id,
        position,
    };
    match lists.reorder(id, input).await {
        Ok(ReorderOutcome::Reordered) => ReorderResponse {
            success: true,
            code: None,
            message: None,
        },
        Ok(ReorderOutcome::Rejected(failure)) => {
            ReorderResponse::rejected(failure.code(), failure.message())
        }
        Err(error) => {
            eprintln!("Reorder failed for watchlist {id}: {error}");
            ReorderResponse::rejected("internal_error", "Unable to reorder watchlist items.")
        }
    }
}
