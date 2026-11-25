use super::Watchlists;
use super::browse::BrowseView;
use super::dialog::{
    self, DialogFailure, DialogRejection, DialogTarget, WatchlistDialogInput, WatchlistForm,
    WatchlistMutation,
};
use super::item_dialog::{
    self, ItemEditEncoding, ItemEditFailure, ItemEditForm, ItemEditInput, ItemEditRejection,
    RawField,
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

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemEditFields {
    #[serde(deserialize_with = "raw_field")]
    title: RawField,
    #[serde(deserialize_with = "raw_field")]
    release_date: RawField,
    #[serde(deserialize_with = "raw_field")]
    poster_path: RawField,
}

fn raw_field<'de, D>(deserializer: D) -> Result<RawField, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(match Option::<String>::deserialize(deserializer)? {
        None => RawField::Null,
        Some(value) => RawField::Value(value),
    })
}

#[derive(Template)]
#[template(path = "item-edit-form.html")]
struct ItemEditFormFragment<'a> {
    form: &'a ItemEditForm,
}

fn is_json_content_type(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("application/json"))
}

fn with_write_vary(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(header::VARY, HeaderValue::from_static(WRITE_VARY));
    response
}

fn item_saved_response(watchlist_id: i64, item_id: i64) -> Response {
    let trigger = serde_json::json!({
        "watchlist-item-saved": {
            "watchlistId": watchlist_id,
            "watchlistItemId": item_id,
            "message": "Changes saved successfully",
        }
    })
    .to_string();
    let mut response = StatusCode::NO_CONTENT.into_response();
    if let Ok(header_value) = HeaderValue::from_str(&trigger) {
        response
            .headers_mut()
            .insert(HeaderName::from_static("hx-trigger"), header_value);
    }
    with_write_vary(response)
}

fn item_form_response(form: ItemEditForm, status: StatusCode) -> Response {
    match (ItemEditFormFragment { form: &form }).render() {
        Ok(html) => with_write_vary((status, Html(html)).into_response()),
        Err(error) => with_write_vary(failure(error).into_response()),
    }
}

fn item_rejection_response(
    htmx: bool,
    format: ResponseFormat,
    rejection: ItemEditRejection,
) -> Response {
    let ItemEditRejection { failure, form } = rejection;
    let status = match failure {
        ItemEditFailure::Validation(_, _) => StatusCode::BAD_REQUEST,
        ItemEditFailure::NotFound => StatusCode::NOT_FOUND,
        ItemEditFailure::Internal => StatusCode::INTERNAL_SERVER_ERROR,
    };
    if htmx {
        return item_form_response(*form, StatusCode::OK);
    }
    if format.representation() == Representation::Html {
        return item_form_response(*form, status);
    }
    json_response(
        status,
        serde_json::json!({
            "success": false,
            "code": failure.code(),
            "message": form.error,
            "watchlistId": form.watchlist_id,
            "watchlistItemId": form.item_id,
        }),
    )
}

pub async fn edit_item_form(
    State(lists): State<Watchlists>,
    Path((watchlist_id, item_id)): Path<(i64, i64)>,
    format: ResponseFormat,
    headers: HeaderMap,
) -> Result<Response, Failure> {
    let htmx = htmx_request(&headers);
    let Some(item) = lists.item(watchlist_id, item_id).await.map_err(failure)? else {
        return Ok(
            if !htmx && format.representation() == Representation::Json {
                json_response(
                    StatusCode::NOT_FOUND,
                    serde_json::json!({
                        "success": false,
                        "code": "not_found",
                        "message": "Watchlist item not found.",
                        "watchlistId": watchlist_id,
                        "watchlistItemId": item_id,
                    }),
                )
            } else {
                item_form_response(
                    ItemEditForm::missing(watchlist_id, item_id),
                    StatusCode::NOT_FOUND,
                )
            },
        );
    };
    if !htmx && format.representation() == Representation::Json {
        return Ok(json_response(
            StatusCode::OK,
            serde_json::json!({
                "watchlistId": item.watchlist_id,
                "watchlistItemId": item.id,
                "title": item.title,
                "releaseDate": item.release_date,
                "posterPath": item.poster_path,
            }),
        ));
    }
    let form = ItemEditForm::for_item(&item);
    Ok(item_form_response(form, StatusCode::OK))
}

pub async fn edit_item(
    State(lists): State<Watchlists>,
    Path((watchlist_id, item_id)): Path<(i64, i64)>,
    format: ResponseFormat,
    headers: HeaderMap,
    FormOrJson(fields): FormOrJson<ItemEditFields>,
) -> Result<Response, Failure> {
    let htmx = htmx_request(&headers);
    let input = ItemEditInput {
        title: fields.title,
        release_date: fields.release_date,
        poster_path: fields.poster_path,
        encoding: if is_json_content_type(&headers) {
            ItemEditEncoding::Json
        } else {
            ItemEditEncoding::Form
        },
    };
    let Some(item) = lists.item(watchlist_id, item_id).await.map_err(failure)? else {
        return Ok(item_rejection_response(
            htmx,
            format,
            ItemEditRejection::missing(watchlist_id, item_id),
        ));
    };
    let changes = match item_dialog::submit(&item, &input) {
        Ok(changes) => changes,
        Err(rejection) => return Ok(item_rejection_response(htmx, format, rejection)),
    };
    match lists.edit_watchlist_item(changes).await {
        Ok(UpdateOutcome::Updated) => {
            if htmx {
                Ok(item_saved_response(watchlist_id, item_id))
            } else if format.representation() == Representation::Html {
                Ok(with_write_vary(
                    (
                        StatusCode::SEE_OTHER,
                        [(header::LOCATION, format!("/v2/watchlists/{watchlist_id}"))],
                    )
                        .into_response(),
                ))
            } else {
                Ok(json_response(
                    StatusCode::OK,
                    serde_json::json!({
                        "success": true,
                        "code": "edited",
                        "message": "Watchlist item edited.",
                        "watchlistId": watchlist_id,
                        "watchlistItemId": item_id,
                    }),
                ))
            }
        }
        Ok(UpdateOutcome::NotFound) => Ok(item_rejection_response(
            htmx,
            format,
            item_dialog::rejected(&item, &input, ItemEditFailure::NotFound),
        )),
        Err(error) => {
            eprintln!(
                "Watchlist item edit failed for watchlist {watchlist_id}, item {item_id}: {error}"
            );
            Ok(item_rejection_response(
                htmx,
                format,
                item_dialog::rejected(&item, &input, ItemEditFailure::Internal),
            ))
        }
    }
}
