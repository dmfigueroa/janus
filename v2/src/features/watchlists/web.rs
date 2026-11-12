use super::{ItemOrderMode, Watchlists};
use askama::Template;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Html,
};
use serde::Deserialize;
#[derive(Default, Deserialize)]
pub struct Filters {
    #[serde(default)]
    query: String,
    #[serde(default = "default_unwatched")]
    unwatched: bool,
}
fn default_unwatched() -> bool {
    true
}
#[derive(Template)]
#[template(path = "watchlist.html")]
struct Page {
    name: String,
    description: String,
    mode: String,
    progress: u64,
    watched: u64,
    total: u64,
    query: String,
    unwatched: bool,
    runs: Vec<Run>,
    paused: bool,
}
#[derive(Clone)]
struct Row {
    id: i64,
    title: String,
    parent: String,
    episode: String,
    date: String,
    year: String,
    watched: bool,
    poster: String,
    media: String,
}
struct Run {
    year: String,
    heading: bool,
    hidden: bool,
    rows: Vec<Row>,
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
    let detail = lists
        .detail(id)
        .await
        .map_err(failure)?
        .ok_or((StatusCode::NOT_FOUND, "Watchlist not found"))?;
    let list = &detail.watchlist.watchlist;
    let stats = &detail.watchlist.stats;
    let query = filters.query.trim().to_ascii_lowercase();
    let rows: Vec<Row> = detail
        .items
        .iter()
        .filter(|item| item.matches_text(&query))
        .map(|item| {
            let date = item.release_date.clone().unwrap_or_default();
            Row {
                id: item.id,
                title: item.title.clone(),
                parent: item.parent_title.clone().unwrap_or_default(),
                episode: item.episode.clone().unwrap_or_default(),
                year: if date.is_empty() {
                    "TBA".into()
                } else {
                    date.split_once('-')
                        .map_or(date.as_str(), |(year, _)| year)
                        .into()
                },
                date,
                watched: item.is_watched == Some(true),
                poster: poster(item.poster_path.as_deref().unwrap_or("")),
                media: item.media_type.clone(),
            }
        })
        .collect();
    let release_mode = list.item_order_mode == ItemOrderMode::Release;
    let groups: Vec<&[Row]> = rows
        .chunk_by(|previous, next| {
            previous.watched == next.watched && (!release_mode || previous.year == next.year)
        })
        .collect();
    let runs = groups
        .iter()
        .enumerate()
        .map(|(index, rows)| Run {
            year: rows[0].year.clone(),
            heading: release_mode && (index == 0 || groups[index - 1][0].year != rows[0].year),
            hidden: filters.unwatched && rows[0].watched,
            rows: rows.to_vec(),
        })
        .collect();
    Page {
        name: list.name.clone(),
        description: list.description.clone().unwrap_or_default(),
        mode: list.item_order_mode.as_str().into(),
        progress: stats.progress,
        watched: stats.watched_items as u64,
        total: stats.total_items as u64,
        query: filters.query,
        unwatched: filters.unwatched,
        runs,
        paused: list.paused_at.is_some(),
    }
    .render()
    .map(Html)
    .map_err(failure)
}

fn poster(path: &str) -> String {
    if path.is_empty() {
        String::new()
    } else if path.starts_with("https://") || path.starts_with("http://") {
        path.into()
    } else {
        format!(
            "https://image.tmdb.org/t/p/w200/{}",
            path.trim_start_matches('/')
        )
    }
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
