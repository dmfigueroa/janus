use super::Watchlists;
use super::browse::BrowseView;
use super::timeline::{TimelineFilters, TimelineView};
use crate::http::{FormOrJson, ResponseFormat};
use askama::Template;
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{Html, IntoResponse, Response},
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
#[serde(rename_all = "camelCase")]
pub struct ListFilters {
    #[serde(default)]
    query: String,
    cursor: Option<String>,
}
#[derive(Template)]
#[template(path = "watchlists.html")]
struct ListPage<'a> {
    view: &'a BrowseView,
}
#[derive(Template)]
#[template(path = "watchlist-browse.html")]
struct BrowseFragment<'a> {
    view: &'a BrowseView,
}
pub async fn list(
    State(lists): State<Watchlists>,
    headers: HeaderMap,
    Query(filters): Query<ListFilters>,
) -> Result<Response, Failure> {
    use super::browse::{BrowseError, BrowseFilters, BrowseView};
    let filters = BrowseFilters {
        query: filters.query,
        cursor: filters.cursor,
    };
    let summaries = lists.all_summaries().await.map_err(failure)?;
    let view = BrowseView::build(&summaries, &filters).map_err(|error| match error {
        BrowseError::InvalidCursor => (
            StatusCode::BAD_REQUEST,
            "Unable to load this page. Return to /v2/watchlists and try again.",
        ),
    })?;
    let htmx = headers
        .get("hx-request")
        .is_some_and(|value| value == "true");
    let restoring = headers
        .get("hx-history-restore-request")
        .is_some_and(|value| value == "true");
    let json = headers
        .get(header::ACCEPT)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.contains("application/json"));
    let page = if htmx && !restoring {
        BrowseFragment { view: &view }.render()
    } else if json {
        return Ok(([(header::VARY, "HX-Request, Accept")], Json(view)).into_response());
    } else {
        ListPage { view: &view }.render()
    }
    .map(Html)
    .map_err(failure)?;
    Ok(([(header::VARY, "HX-Request, Accept")], page).into_response())
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
