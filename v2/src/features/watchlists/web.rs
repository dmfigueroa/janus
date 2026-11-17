use super::Watchlists;
use super::browse::BrowseView;
use super::form::WatchlistForm;
use super::timeline::{TimelineFilters, TimelineView};
use super::write::{NewWatchlist, UpdateOutcome, WatchlistChanges};
use crate::http::{BrowseFormat, FormOrJson, ResponseFormat};
use askama::Template;
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
};
use serde::{Deserialize, Deserializer, Serialize};
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
    form: &'a WatchlistForm,
}
#[derive(Template)]
#[template(path = "watchlist-browse.html")]
struct BrowseFragment<'a> {
    view: &'a BrowseView,
}
pub async fn list(
    State(lists): State<Watchlists>,
    format: BrowseFormat,
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
    let representation = format.representation();
    let form = WatchlistForm::create();
    format
        .respond(&view, async {
            match representation {
                ResponseFormat::Html => BrowseFragment { view: &view }.render(),
                ResponseFormat::Page | ResponseFormat::Json => ListPage {
                    view: &view,
                    form: &form,
                }
                .render(),
            }
            .map(Html)
            .map_err(failure)
        })
        .await
}

const WRITE_VARY: &str = "HX-Request, Accept";

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CreateWatchlistInput {
    #[serde(deserialize_with = "nullable_field")]
    name: Option<Option<String>>,
    #[serde(deserialize_with = "nullable_field")]
    description: Option<Option<String>>,
    #[serde(deserialize_with = "nullable_field")]
    item_order_mode: Option<Option<String>>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateWatchlistInput {
    #[serde(deserialize_with = "nullable_field")]
    name: Option<Option<String>>,
    #[serde(deserialize_with = "nullable_field")]
    description: Option<Option<String>>,
    #[serde(deserialize_with = "nullable_field")]
    item_order_mode: Option<Option<String>>,
}

fn nullable_field<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

#[derive(Template)]
#[template(path = "watchlist-form.html")]
struct FormFragment<'a> {
    form: &'a WatchlistForm,
}

fn htmx_request(headers: &HeaderMap) -> bool {
    headers
        .get("hx-request")
        .is_some_and(|value| value == "true")
}

fn json_response(status: StatusCode, body: serde_json::Value) -> Response {
    let mut response = Json(body).into_response();
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(header::VARY, HeaderValue::from_static(WRITE_VARY));
    response
}

fn saved_response(title: &'static str, mode: &'static str) -> Response {
    let trigger = serde_json::json!({
        "watchlist-saved": {"mode": mode, "message": title}
    })
    .to_string();
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        HeaderName::from_static("hx-trigger"),
        HeaderValue::from_str(&trigger).unwrap(),
    );
    response
        .headers_mut()
        .insert(header::VARY, HeaderValue::from_static(WRITE_VARY));
    response
}

fn form_failure(form: WatchlistForm, status: StatusCode) -> Response {
    match (FormFragment { form: &form }).render() {
        Ok(html) => {
            let mut response = (status, Html(html)).into_response();
            response
                .headers_mut()
                .insert(header::VARY, HeaderValue::from_static(WRITE_VARY));
            response
        }
        Err(error) => failure(error).into_response(),
    }
}

fn parse_mode(value: Option<&str>) -> Result<Option<super::ItemOrderMode>, &'static str> {
    value
        .map(|mode| super::ItemOrderMode::parse(mode).ok_or("Invalid order mode."))
        .transpose()
}

fn rejection(
    htmx: bool,
    format: ResponseFormat,
    form: WatchlistForm,
    status: StatusCode,
    code: &str,
    watchlist_id: Option<i64>,
) -> Response {
    if htmx || matches!(format, ResponseFormat::Html) {
        return form_failure(form, StatusCode::OK);
    }
    let mut body = serde_json::json!({
        "success": false,
        "code": code,
        "message": form.error,
    });
    if let Some(watchlist_id) = watchlist_id {
        body["watchlistId"] = serde_json::json!(watchlist_id);
    }
    json_response(status, body)
}

fn create_form(input: &CreateWatchlistInput, error: Option<String>) -> WatchlistForm {
    WatchlistForm {
        name: input.name.clone().flatten().unwrap_or_default(),
        description: input.description.clone().flatten().unwrap_or_default(),
        item_order_mode: input
            .item_order_mode
            .clone()
            .flatten()
            .unwrap_or_else(|| "release".into()),
        error,
        ..WatchlistForm::create()
    }
}

fn update_form(
    record: &super::WatchlistRecord,
    input: &UpdateWatchlistInput,
    error: Option<String>,
) -> WatchlistForm {
    WatchlistForm {
        name: input
            .name
            .clone()
            .flatten()
            .unwrap_or_else(|| record.name.clone()),
        description: input
            .description
            .clone()
            .flatten()
            .unwrap_or_else(|| record.description.clone().unwrap_or_default()),
        item_order_mode: input
            .item_order_mode
            .clone()
            .flatten()
            .unwrap_or_else(|| record.item_order_mode.as_str().into()),
        error,
        ..WatchlistForm::edit(record)
    }
}

pub async fn create(
    State(lists): State<Watchlists>,
    format: ResponseFormat,
    headers: HeaderMap,
    FormOrJson(input): FormOrJson<CreateWatchlistInput>,
) -> Response {
    let htmx = htmx_request(&headers);
    let rendered = |form: WatchlistForm| {
        rejection(
            htmx,
            format,
            form,
            StatusCode::BAD_REQUEST,
            "validation_error",
            None,
        )
    };
    let Some(Some(name)) = input.name.as_ref() else {
        return rendered(create_form(&input, Some("Name is required".into())));
    };
    if name.trim().is_empty() {
        return rendered(create_form(&input, Some("Name is required".into())));
    }
    let description = match input.description.clone() {
        None => None,
        Some(Some(description)) => Some(description),
        Some(None) => {
            return rendered(create_form(&input, Some("Invalid description.".into())));
        }
    };
    let mode = match parse_mode(input.item_order_mode.as_ref().and_then(Option::as_deref)) {
        Ok(mode) => mode,
        Err(message) => return rendered(create_form(&input, Some(message.into()))),
    };
    let new_watchlist = NewWatchlist {
        name: name.to_owned(),
        description,
        item_order_mode: mode,
    };
    match lists.create_watchlist(new_watchlist).await {
        Ok(record) => {
            if htmx {
                saved_response("Watchlist created successfully", "create")
            } else if matches!(format, ResponseFormat::Html) {
                (
                    StatusCode::SEE_OTHER,
                    [(header::LOCATION, "/v2/watchlists")],
                )
                    .into_response()
            } else {
                json_response(
                    StatusCode::OK,
                    serde_json::json!({
                        "success": true,
                        "code": "created",
                        "message": "Watchlist created.",
                        "watchlist": {
                            "id": record.id,
                            "name": record.name,
                            "description": record.description,
                            "itemOrderMode": record.item_order_mode.as_str(),
                        },
                    }),
                )
            }
        }
        Err(error) => {
            eprintln!("Watchlist create failed: {error}");
            rejection(
                htmx,
                format,
                create_form(
                    &input,
                    Some("Unable to create watchlist. Please try again.".into()),
                ),
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                None,
            )
        }
    }
}

pub async fn update(
    State(lists): State<Watchlists>,
    Path(id): Path<i64>,
    format: ResponseFormat,
    headers: HeaderMap,
    FormOrJson(input): FormOrJson<UpdateWatchlistInput>,
) -> Result<Response, Failure> {
    let htmx = htmx_request(&headers);
    let record = lists.record(id).await.map_err(failure)?;
    let Some(record) = record else {
        if htmx || matches!(format, ResponseFormat::Html) {
            return Ok(form_failure(WatchlistForm::missing(id), StatusCode::OK));
        }
        return Ok(json_response(
            StatusCode::NOT_FOUND,
            serde_json::json!({
                "success": false,
                "code": "not_found",
                "message": "Watchlist not found.",
                "watchlistId": id,
            }),
        ));
    };
    if input.name.is_none() && input.description.is_none() && input.item_order_mode.is_none() {
        return Ok(rejection(
            htmx,
            format,
            update_form(&record, &input, Some("No fields to update.".into())),
            StatusCode::BAD_REQUEST,
            "validation_error",
            Some(id),
        ));
    }
    let name = match input.name.as_ref() {
        None => None,
        Some(Some(name)) if !name.trim().is_empty() => Some(name.clone()),
        Some(_) => {
            return Ok(rejection(
                htmx,
                format,
                update_form(&record, &input, Some("Name is required".into())),
                StatusCode::BAD_REQUEST,
                "validation_error",
                Some(id),
            ));
        }
    };
    if matches!(input.item_order_mode, Some(None)) {
        return Ok(rejection(
            htmx,
            format,
            update_form(&record, &input, Some("Invalid order mode.".into())),
            StatusCode::BAD_REQUEST,
            "validation_error",
            Some(id),
        ));
    }
    let mode = match parse_mode(input.item_order_mode.as_ref().and_then(Option::as_deref)) {
        Ok(mode) => mode,
        Err(message) => {
            return Ok(rejection(
                htmx,
                format,
                update_form(&record, &input, Some(message.into())),
                StatusCode::BAD_REQUEST,
                "validation_error",
                Some(id),
            ));
        }
    };
    let changes = WatchlistChanges {
        watchlist_id: id,
        name,
        description: input.description.clone(),
        item_order_mode: mode,
    };
    match lists.update_watchlist(changes).await {
        Ok(UpdateOutcome::Updated) => {
            if htmx {
                Ok(saved_response("Changes saved successfully", "edit"))
            } else if matches!(format, ResponseFormat::Html) {
                Ok((
                    StatusCode::SEE_OTHER,
                    [(header::LOCATION, format!("/v2/watchlists/{id}"))],
                )
                    .into_response())
            } else {
                Ok(json_response(
                    StatusCode::OK,
                    serde_json::json!({
                        "success": true,
                        "code": "updated",
                        "message": "Watchlist updated.",
                        "watchlistId": id,
                    }),
                ))
            }
        }
        Ok(UpdateOutcome::NotFound) => Ok(rejection(
            htmx,
            format,
            update_form(&record, &input, Some("Watchlist not found.".into())),
            StatusCode::NOT_FOUND,
            "not_found",
            Some(id),
        )),
        Err(error) => {
            eprintln!("Watchlist update failed for {id}: {error}");
            Ok(rejection(
                htmx,
                format,
                update_form(
                    &record,
                    &input,
                    Some("Unable to update watchlist. Please try again.".into()),
                ),
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                Some(id),
            ))
        }
    }
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
