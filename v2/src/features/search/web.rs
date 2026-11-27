//! `/v2/search` page, result fragment, detail sheet, and add form.
//!
//! The sheet is the search hit the browser already has. Adding a title calls
//! the addition operation, which finishes provider HTTP before the write.

use crate::features::watchlists::addition::{
    InsertionIntent, InsertionPosition, MediaAddition, ProviderConfig, WatchlistWriteResult,
    WriteFailure, add_provider_media,
};
use crate::features::watchlists::{ItemOrderMode, WatchlistSummary};
use crate::http::{FormOrJson, Representation, ResponseFormat};
use crate::{AppState, features::search};
use askama::Template;
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
};
use search::{DEPRECATED_MEDIA_MESSAGE, MediaSearchOutcome, SearchableMediaType, UnifiedMedia};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize, Default)]
pub(crate) struct SearchQuery {
    #[serde(default)]
    query: String,
    #[serde(default, rename = "type")]
    media_type: String,
    #[serde(default)]
    page: Option<i64>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetailQuery {
    #[serde(default)]
    provider: String,
    #[serde(default)]
    provider_id: String,
    #[serde(default)]
    media_type: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    year: String,
    #[serde(default)]
    overview: String,
    #[serde(default)]
    poster: String,
    #[serde(default)]
    backdrop: String,
    #[serde(default)]
    rating: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddForm {
    watchlist_id: i64,
    provider: String,
    provider_id: String,
    media_type: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    insertion_position: String,
}

struct HitView {
    provider: String,
    provider_id: String,
    media_type: String,
    title: String,
    year: String,
    overview: String,
    poster: String,
    backdrop: String,
    release_date: String,
    rating_label: String,
    has_poster: bool,
    has_rating: bool,
    high_rating: bool,
}

struct TabView {
    value: String,
    label: String,
    selected: bool,
}

struct SearchView {
    query: String,
    media_type: String,
    next_page: u32,
    has_next: bool,
    notice: String,
    status_message: String,
    empty_hint: String,
    status_role: String,
    hits: Vec<HitView>,
    tabs: Vec<TabView>,
}

struct ListChoice {
    id: i64,
    name: String,
    custom: bool,
    selected: bool,
}

struct DetailView {
    provider: String,
    provider_id: String,
    media_type: String,
    type_label: String,
    title: String,
    year_label: String,
    overview: String,
    poster: String,
    backdrop: String,
    rating_label: String,
    has_poster: bool,
    has_backdrop: bool,
    notice_media: String,
    notice_items: String,
    has_notice: bool,
    watchlists: Vec<ListChoice>,
    has_lists: bool,
    insertion_visible: bool,
}

#[derive(Template)]
#[template(path = "search.html")]
struct SearchPage<'a> {
    view: &'a SearchView,
    nav: crate::features::PrimaryNav,
}

#[derive(Template)]
#[template(path = "search-screen.html")]
struct SearchScreen<'a> {
    view: &'a SearchView,
}

#[derive(Template)]
#[template(path = "search-results.html")]
struct SearchResults<'a> {
    view: &'a SearchView,
}

#[derive(Template)]
#[template(path = "search-detail.html")]
struct SearchDetail<'a> {
    view: &'a DetailView,
}

#[derive(Template)]
#[template(path = "search-add-alert.html")]
struct SearchAlert<'a> {
    message: &'a str,
}

/// Full search document, a screen or results fragment, or the JSON envelope.
pub(crate) async fn search(
    State(state): State<AppState>,
    format: ResponseFormat,
    headers: HeaderMap,
    Query(query): Query<SearchQuery>,
) -> Response {
    let media_type =
        SearchableMediaType::parse(&query.media_type).unwrap_or(SearchableMediaType::Movie);
    let page = query.page.unwrap_or(1);
    let outcome =
        search::search_media(state.catalog.as_ref(), &query.query, media_type, page).await;
    let view = search_view(query.query.trim(), media_type, &outcome);
    match format.representation() {
        Representation::Json => vary(format, Json(search_json(&outcome)).into_response()),
        Representation::Page => render(
            format,
            SearchPage {
                view: &view,
                nav: crate::features::PrimaryNav::search(),
            },
        ),
        Representation::Html
            if headers
                .get("hx-target")
                .and_then(|value| value.to_str().ok())
                == Some("search-screen") =>
        {
            render(format, SearchScreen { view: &view })
        }
        Representation::Html => render(format, SearchResults { view: &view }),
    }
}

/// Detail sheet for one search hit. The hit fields are the sheet; TMDB is not called again.
pub(crate) async fn detail(
    State(state): State<AppState>,
    format: ResponseFormat,
    Query(query): Query<DetailQuery>,
) -> Response {
    if query.title.trim().is_empty() || query.provider_id.trim().is_empty() {
        return vary(
            format,
            (StatusCode::BAD_REQUEST, "Invalid media.").into_response(),
        );
    }
    let summaries = match state.lists.all_summaries().await {
        Ok(summaries) => summaries,
        Err(error) => {
            eprintln!("Search watchlist load failed: {error}");
            return vary(
                format,
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Unable to load watchlists. Please try again.",
                )
                    .into_response(),
            );
        }
    };
    let view = detail_view(&query, &summaries);
    match format.representation() {
        Representation::Json => vary(format, Json(detail_json(&view)).into_response()),
        Representation::Page | Representation::Html => render(format, SearchDetail { view: &view }),
    }
}

/// Adds the submitted hit. HTMX success is `204` plus `search-added`; failures swap an alert.
pub(crate) async fn add(
    State(state): State<AppState>,
    format: ResponseFormat,
    FormOrJson(form): FormOrJson<AddForm>,
) -> Response {
    let addition = match parse_addition(form) {
        Ok(addition) => addition,
        Err(result) => return add_response(format, &result),
    };
    let result = add_provider_media(
        &state.lists,
        state.catalog.as_ref(),
        &ProviderConfig::from_env(),
        &addition,
    )
    .await;
    add_response(format, &result)
}

fn search_view(
    query: &str,
    media_type: SearchableMediaType,
    outcome: &MediaSearchOutcome,
) -> SearchView {
    let (hits, total_pages, status_message, empty_hint) = match outcome {
        MediaSearchOutcome::Results {
            results,
            total_pages,
            ..
        } if results.is_empty() => (
            Vec::new(),
            *total_pages,
            "No results found".to_owned(),
            "Try adjusting your search terms".to_owned(),
        ),
        MediaSearchOutcome::Results {
            results,
            total_pages,
            ..
        } => (
            results.iter().map(hit_view).collect(),
            *total_pages,
            String::new(),
            String::new(),
        ),
        other => (
            Vec::new(),
            1,
            other.message().unwrap_or("").to_owned(),
            String::new(),
        ),
    };
    let page = outcome.page();
    let results = matches!(outcome, MediaSearchOutcome::Results { .. });
    SearchView {
        query: query.to_owned(),
        media_type: media_type.as_str().to_owned(),
        next_page: page.saturating_add(1),
        has_next: results && page < total_pages,
        notice: deprecation_notice(media_type),
        status_message,
        empty_hint,
        status_role: if matches!(outcome, MediaSearchOutcome::ProviderUnavailable { .. }) {
            "alert".to_owned()
        } else {
            "status".to_owned()
        },
        hits,
        tabs: tab_views(media_type),
    }
}

fn deprecation_notice(media_type: SearchableMediaType) -> String {
    if media_type.is_deprecated() {
        format!("{DEPRECATED_MEDIA_MESSAGE} Please switch to Movies, TV, Games, Books, or Comics.")
    } else {
        DEPRECATED_MEDIA_MESSAGE.to_owned()
    }
}

fn tab_views(selected: SearchableMediaType) -> Vec<TabView> {
    let active = if SearchableMediaType::tabs().contains(&selected) {
        selected
    } else {
        SearchableMediaType::Movie
    };
    SearchableMediaType::tabs()
        .iter()
        .copied()
        .map(|tab| TabView {
            value: tab.as_str().to_owned(),
            label: tab.label().to_owned(),
            selected: tab == active,
        })
        .collect()
}

fn hit_view(hit: &UnifiedMedia) -> HitView {
    let rating = hit.rating.filter(|rating| *rating > 0.0);
    let rating_label = rating
        .map(|rating| format!("{rating:.1}"))
        .unwrap_or_default();
    HitView {
        provider: hit.provider.as_str().to_owned(),
        provider_id: hit.id.clone(),
        media_type: hit.media_type.as_str().to_owned(),
        title: hit.title.clone(),
        year: hit.year.clone().unwrap_or_default(),
        overview: hit.overview.clone().unwrap_or_default(),
        poster: hit.poster.clone().unwrap_or_default(),
        backdrop: hit.backdrop.clone().unwrap_or_default(),
        release_date: hit.release_date.clone().unwrap_or_default(),
        rating_label,
        has_poster: hit.poster.as_ref().is_some_and(|poster| !poster.is_empty()),
        has_rating: rating.is_some(),
        high_rating: rating.is_some_and(|rating| rating >= 7.5),
    }
}

fn detail_view(query: &DetailQuery, summaries: &[WatchlistSummary]) -> DetailView {
    let rating = query
        .rating
        .parse::<f64>()
        .ok()
        .filter(|rating| *rating > 0.0);
    let watchlists = summaries
        .iter()
        .enumerate()
        .map(|(index, summary)| ListChoice {
            id: summary.watchlist.id,
            name: summary.watchlist.name.clone(),
            custom: summary.watchlist.item_order_mode == ItemOrderMode::Custom,
            selected: index == 0,
        })
        .collect::<Vec<_>>();
    let (notice_media, notice_items) = addition_notice(&query.media_type);
    DetailView {
        provider: query.provider.clone(),
        provider_id: query.provider_id.clone(),
        media_type: query.media_type.clone(),
        type_label: type_label(&query.media_type).to_owned(),
        title: query.title.clone(),
        year_label: if query.year.trim().is_empty() {
            "TBA".to_owned()
        } else {
            query.year.clone()
        },
        overview: query.overview.clone(),
        poster: query.poster.clone(),
        backdrop: query.backdrop.clone(),
        rating_label: rating
            .map(|rating| format!("{rating:.1}"))
            .unwrap_or_else(|| "N/A".to_owned()),
        has_poster: !query.poster.trim().is_empty(),
        has_backdrop: !query.backdrop.trim().is_empty(),
        has_notice: notice_media.is_some(),
        notice_media: notice_media.unwrap_or("").to_owned(),
        notice_items: notice_items.unwrap_or("").to_owned(),
        has_lists: !watchlists.is_empty(),
        insertion_visible: watchlists.first().is_some_and(|choice| choice.custom),
        watchlists,
    }
}

fn type_label(media_type: &str) -> &str {
    if media_type == "tv" {
        "TV Series"
    } else {
        media_type
    }
}

fn addition_notice(media_type: &str) -> (Option<&'static str>, Option<&'static str>) {
    match media_type {
        "tv" => (Some("a TV show"), Some("episodes")),
        "anime" => (Some("an anime"), Some("episodes")),
        "comic" => (Some("a comic"), Some("issues/volumes")),
        "manga" => (Some("a manga"), Some("issues/volumes")),
        _ => (None, None),
    }
}

fn search_json(outcome: &MediaSearchOutcome) -> Value {
    match outcome {
        MediaSearchOutcome::Results {
            results,
            page,
            total_pages,
            total_results,
        } => json!({
            "success": true,
            "results": results.iter().map(hit_json).collect::<Vec<_>>(),
            "page": page,
            "totalPages": total_pages,
            "totalResults": total_results,
        }),
        rejected => json!({
            "success": false,
            "code": rejected.status(),
            "message": rejected.message().unwrap_or(""),
        }),
    }
}

fn hit_json(hit: &UnifiedMedia) -> Value {
    let mut value = json!({
        "provider": hit.provider.as_str(),
        "providerId": hit.id,
        "mediaType": hit.media_type.as_str(),
        "title": hit.title,
        "posterImage": hit.poster,
    });
    if let Some(release_date) = &hit.release_date {
        value["releaseDate"] = Value::String(release_date.clone());
    }
    if let Some(year) = &hit.year {
        value["year"] = Value::String(year.clone());
    }
    if let Some(overview) = &hit.overview {
        value["overview"] = Value::String(overview.clone());
    }
    value
}

fn detail_json(view: &DetailView) -> Value {
    json!({
        "provider": view.provider,
        "providerId": view.provider_id,
        "mediaType": view.media_type,
        "title": view.title,
        "posterImage": if view.has_poster { Value::String(view.poster.clone()) } else { Value::Null },
        "year": view.year_label,
        "overview": view.overview,
    })
}

fn parse_addition(form: AddForm) -> Result<MediaAddition, WatchlistWriteResult> {
    if form.watchlist_id <= 0 {
        return Err(validation("Invalid media addition."));
    }
    let insertion = InsertionIntent {
        position: parse_position(&form.insertion_position)?,
        reference_item_id: None,
    };
    let provider = form.provider.as_str();
    let media_type = form.media_type.as_str();
    let addition = match (provider, media_type) {
        ("tmdb", "movie") => MediaAddition::Movie {
            watchlist_id: form.watchlist_id,
            tmdb_id: tmdb_id(&form.provider_id)?,
            insertion,
        },
        ("tmdb", "tv") => MediaAddition::Television {
            watchlist_id: form.watchlist_id,
            show_id: tmdb_id(&form.provider_id)?,
            title: form.title,
            insertion,
        },
        ("rawg", "game") => {
            required_id(&form.provider_id)?;
            MediaAddition::Game {
                watchlist_id: form.watchlist_id,
                insertion,
            }
        }
        ("google_books", "book") => {
            required_id(&form.provider_id)?;
            MediaAddition::Book {
                watchlist_id: form.watchlist_id,
                insertion,
            }
        }
        ("comicvine", "comic" | "comic_issue") => {
            required_id(&form.provider_id)?;
            MediaAddition::Comic {
                watchlist_id: form.watchlist_id,
                insertion,
            }
        }
        ("anilist", "anime" | "manga") => {
            required_id(&form.provider_id)?;
            MediaAddition::Deprecated {
                watchlist_id: form.watchlist_id,
                insertion,
            }
        }
        _ => return Err(validation("Invalid media addition.")),
    };
    Ok(addition)
}

fn parse_position(value: &str) -> Result<Option<InsertionPosition>, WatchlistWriteResult> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    InsertionPosition::parse(trimmed)
        .map(Some)
        .ok_or_else(|| validation("Invalid media addition."))
}

fn tmdb_id(value: &str) -> Result<u64, WatchlistWriteResult> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(validation("Provider ID must be a TMDB numeric ID."));
    }
    value
        .parse()
        .map_err(|_| validation("Provider ID must be a TMDB numeric ID."))
}

fn required_id(value: &str) -> Result<(), WatchlistWriteResult> {
    if value.trim().is_empty() {
        Err(validation("Provider ID is required."))
    } else {
        Ok(())
    }
}

fn validation(message: &str) -> WatchlistWriteResult {
    WatchlistWriteResult::failed(WriteFailure::ValidationError, message)
}

fn add_response(format: ResponseFormat, result: &WatchlistWriteResult) -> Response {
    let body = json!({
        "success": result.success(),
        "code": result.code(),
        "message": result.message(),
        "affectedCount": result.affected_count(),
    });
    if format.representation() == Representation::Json {
        return vary(format, (json_status(result), Json(body)).into_response());
    }
    if result.success() {
        return vary(format, saved(result.message()));
    }
    match (SearchAlert {
        message: result.message(),
    })
    .render()
    {
        Ok(markup) => vary(format, Html(markup).into_response()),
        Err(error) => {
            eprintln!("Search alert render failed: {error}");
            vary(
                format,
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Unable to render search.",
                )
                    .into_response(),
            )
        }
    }
}

fn json_status(result: &WatchlistWriteResult) -> StatusCode {
    if result.success() {
        return StatusCode::OK;
    }
    match result.code() {
        "not_found" => StatusCode::NOT_FOUND,
        "provider_unavailable" | "provider_not_configured" => StatusCode::SERVICE_UNAVAILABLE,
        "internal_error" => StatusCode::INTERNAL_SERVER_ERROR,
        _ => StatusCode::BAD_REQUEST,
    }
}

fn saved(message: &str) -> Response {
    let trigger = json!({"search-added": {"message": message}}).to_string();
    let mut response = StatusCode::NO_CONTENT.into_response();
    if let Ok(header_value) = HeaderValue::from_str(&trigger) {
        response
            .headers_mut()
            .insert(HeaderName::from_static("hx-trigger"), header_value);
    }
    response
}

fn render(format: ResponseFormat, template: impl Template) -> Response {
    match template.render() {
        Ok(markup) => vary(format, Html(markup).into_response()),
        Err(error) => {
            eprintln!("Search render failed: {error}");
            vary(
                format,
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Unable to render search.",
                )
                    .into_response(),
            )
        }
    }
}

fn vary(format: ResponseFormat, mut response: Response) -> Response {
    if let Ok(value) = HeaderValue::from_str(format.vary()) {
        response.headers_mut().insert(header::VARY, value);
    }
    response
}
