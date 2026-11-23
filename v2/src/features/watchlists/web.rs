use super::Watchlists;
use super::add_custom::{self, AddCustomOutcome, CustomItemForm};
use super::browse::BrowseView;
use super::dialog::{
    self, DialogFailure, DialogRejection, DialogTarget, WatchlistDialogInput, WatchlistForm,
    WatchlistMutation,
};
use super::timeline::{TimelineFilters, TimelineView};
use super::write::UpdateOutcome;
use crate::http::{FormOrJson, Representation, ResponseFormat};
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
    format: ResponseFormat,
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
                Representation::Html => BrowseFragment { view: &view }.render(),
                Representation::Page | Representation::Json => ListPage {
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
pub struct WatchlistFields {
    #[serde(deserialize_with = "nullable_field")]
    name: Option<Option<String>>,
    #[serde(deserialize_with = "nullable_field")]
    description: Option<Option<String>>,
    #[serde(deserialize_with = "nullable_field")]
    item_order_mode: Option<Option<String>>,
}

impl From<WatchlistFields> for WatchlistDialogInput {
    fn from(fields: WatchlistFields) -> Self {
        Self {
            name: fields.name,
            description: fields.description,
            item_order_mode: fields.item_order_mode,
        }
    }
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

#[derive(Template)]
#[template(path = "custom-item-form.html")]
struct CustomItemFormFragment<'a> {
    custom_form: &'a CustomItemForm,
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

fn rejection_response(htmx: bool, format: ResponseFormat, rejection: DialogRejection) -> Response {
    let DialogRejection { failure, form } = rejection;
    if htmx || format.representation() == Representation::Html {
        return form_failure(*form, StatusCode::OK);
    }
    let status = match failure {
        DialogFailure::Validation(_) => StatusCode::BAD_REQUEST,
        DialogFailure::NotFound => StatusCode::NOT_FOUND,
        DialogFailure::Internal => StatusCode::INTERNAL_SERVER_ERROR,
    };
    let mut body = serde_json::json!({
        "success": false,
        "code": failure.code(),
        "message": form.error,
    });
    if let Some(watchlist_id) = form.watchlist_id {
        body["watchlistId"] = serde_json::json!(watchlist_id);
    }
    json_response(status, body)
}

pub async fn create(
    State(lists): State<Watchlists>,
    format: ResponseFormat,
    headers: HeaderMap,
    FormOrJson(fields): FormOrJson<WatchlistFields>,
) -> Response {
    let htmx = htmx_request(&headers);
    let input = WatchlistDialogInput::from(fields);
    let new_watchlist = match dialog::submit(DialogTarget::Create, &input) {
        Ok(WatchlistMutation::Create(new_watchlist)) => new_watchlist,
        Ok(WatchlistMutation::Update(_)) => {
            eprintln!("Create dialog produced an update mutation");
            return rejection_response(
                htmx,
                format,
                dialog::rejected(DialogTarget::Create, &input, DialogFailure::Internal),
            );
        }
        Err(rejection) => return rejection_response(htmx, format, rejection),
    };
    match lists.create_watchlist(new_watchlist).await {
        Ok(record) => {
            if htmx {
                saved_response("Watchlist created successfully", "create")
            } else if format.representation() == Representation::Html {
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
            rejection_response(
                htmx,
                format,
                dialog::rejected(DialogTarget::Create, &input, DialogFailure::Internal),
            )
        }
    }
}

pub async fn update(
    State(lists): State<Watchlists>,
    Path(id): Path<i64>,
    format: ResponseFormat,
    headers: HeaderMap,
    FormOrJson(fields): FormOrJson<WatchlistFields>,
) -> Result<Response, Failure> {
    let htmx = htmx_request(&headers);
    let input = WatchlistDialogInput::from(fields);
    let Some(record) = lists.record(id).await.map_err(failure)? else {
        return Ok(rejection_response(
            htmx,
            format,
            DialogRejection::missing(id),
        ));
    };
    let target = DialogTarget::Edit(&record);
    let changes = match dialog::submit(target, &input) {
        Ok(WatchlistMutation::Update(changes)) => changes,
        Ok(WatchlistMutation::Create(_)) => {
            eprintln!("Update dialog produced a create mutation for watchlist {id}");
            return Ok(rejection_response(
                htmx,
                format,
                dialog::rejected(target, &input, DialogFailure::Internal),
            ));
        }
        Err(rejection) => return Ok(rejection_response(htmx, format, rejection)),
    };
    match lists.update_watchlist(changes).await {
        Ok(UpdateOutcome::Updated) => {
            if htmx {
                Ok(saved_response("Changes saved successfully", "edit"))
            } else if format.representation() == Representation::Html {
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
        Ok(UpdateOutcome::NotFound) => Ok(rejection_response(
            htmx,
            format,
            dialog::rejected(target, &input, DialogFailure::NotFound),
        )),
        Err(error) => {
            eprintln!("Watchlist update failed for {id}: {error}");
            Ok(rejection_response(
                htmx,
                format,
                dialog::rejected(target, &input, DialogFailure::Internal),
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

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustomItemFields {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    media_type: Option<String>,
    #[serde(default)]
    year: Option<String>,
    #[serde(default)]
    insertion_position: Option<String>,
    #[serde(default)]
    reference_item_id: Option<i64>,
}

pub async fn add_custom_item(
    State(lists): State<Watchlists>,
    Path(id): Path<i64>,
    format: ResponseFormat,
    headers: HeaderMap,
    FormOrJson(fields): FormOrJson<CustomItemFields>,
) -> Result<Response, Failure> {
    let htmx = htmx_request(&headers);
    let title = fields.title.as_deref().unwrap_or_default();
    let media_type = fields.media_type.as_deref().unwrap_or("movie");
    let year = fields.year.as_deref().unwrap_or_default();
    let insertion_position = fields.insertion_position.as_deref().unwrap_or_default();
    let custom_order = lists
        .record(id)
        .await
        .map_err(failure)?
        .is_some_and(|record| record.item_order_mode == super::ItemOrderMode::Custom);
    let retained = CustomItemForm::for_watchlist(id, custom_order).retain(
        title,
        media_type,
        year,
        insertion_position,
    );
    let addition = match add_custom::parse_addition(add_custom::CustomItemInput {
        watchlist_id: Some(id),
        title: fields.title.as_deref(),
        media_type: fields.media_type.as_deref().or(Some("movie")),
        year: fields.year.as_deref(),
        release_date: None,
        parent_title: None,
        episode: None,
        insertion_position: fields
            .insertion_position
            .as_deref()
            .filter(|value| !value.is_empty()),
        reference_item_id: fields.reference_item_id,
    }) {
        Ok(addition) => addition,
        Err(failure) => {
            return Ok(custom_item_rejection(
                htmx,
                format,
                retained.with_error(failure.message().to_owned()),
                failure.code(),
            ));
        }
    };
    match lists.add_custom_item(addition).await {
        Ok(outcome @ (AddCustomOutcome::Added { .. } | AddCustomOutcome::Duplicate { .. })) => {
            if htmx {
                Ok(saved_response("Added to watchlist", "custom-item"))
            } else if format.representation() == Representation::Html {
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
                        "code": outcome.code(),
                        "message": outcome.message(),
                        "watchlistId": id,
                        "affectedCount": outcome.affected_count(),
                    }),
                ))
            }
        }
        Ok(AddCustomOutcome::Rejected(failure)) => Ok(custom_item_rejection(
            htmx,
            format,
            retained.with_error(failure.message().to_owned()),
            failure.code(),
        )),
        Err(error) => {
            eprintln!("Custom item add failed for watchlist {id}: {error}");
            Ok(custom_item_rejection(
                htmx,
                format,
                retained.with_error("Unable to add custom item. Please try again."),
                "internal_error",
            ))
        }
    }
}

fn custom_item_rejection(
    htmx: bool,
    format: ResponseFormat,
    form: CustomItemForm,
    code: &'static str,
) -> Response {
    if htmx || format.representation() == Representation::Html {
        return match (CustomItemFormFragment { custom_form: &form }).render() {
            Ok(html) => {
                let mut response = (StatusCode::OK, Html(html)).into_response();
                response
                    .headers_mut()
                    .insert(header::VARY, HeaderValue::from_static(WRITE_VARY));
                response
            }
            Err(error) => failure(error).into_response(),
        };
    }
    let status = match code {
        "not_found" => StatusCode::NOT_FOUND,
        "validation_error" | "insertion_choice_required" | "not_custom_mode" | "unsupported" => {
            StatusCode::BAD_REQUEST
        }
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    json_response(
        status,
        serde_json::json!({
            "success": false,
            "code": code,
            "message": form.error,
            "watchlistId": form.action.rsplit('/').nth(1).and_then(|value| value.parse::<i64>().ok()),
            "affectedCount": 0,
        }),
    )
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
