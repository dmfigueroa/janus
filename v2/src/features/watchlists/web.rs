use super::Watchlists;
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
    let data = lists
        .detail(id)
        .await
        .map_err(failure)?
        .ok_or((StatusCode::NOT_FOUND, "Watchlist not found"))?;
    let list = &data["watchlist"];
    let query = filters.query.trim().to_ascii_lowercase();
    let rows: Vec<Row> = data["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| {
            ["title", "parentTitle", "episode"].iter().any(|key| {
                item[key]
                    .as_str()
                    .unwrap_or("")
                    .to_ascii_lowercase()
                    .contains(&query)
            })
        })
        .map(|item| {
            let date = item["releaseDate"].as_str().unwrap_or("").to_owned();
            Row {
                id: item["id"].as_i64().unwrap(),
                title: item["title"].as_str().unwrap_or("").into(),
                parent: item["parentTitle"].as_str().unwrap_or("").into(),
                episode: item["episode"].as_str().unwrap_or("").into(),
                year: if date.is_empty() {
                    "TBA".into()
                } else {
                    date.split('-').next().unwrap().into()
                },
                date,
                watched: item["isWatched"] == true,
                poster: poster(item["posterPath"].as_str().unwrap_or("")),
                media: item["mediaType"].as_str().unwrap_or("").into(),
            }
        })
        .collect();
    let release_mode = list["itemOrderMode"] == "release";
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
        name: list["name"].as_str().unwrap_or("").into(),
        description: list["description"].as_str().unwrap_or("").into(),
        mode: list["itemOrderMode"].as_str().unwrap_or("release").into(),
        progress: list["stats"]["progress"].as_u64().unwrap(),
        watched: list["stats"]["watchedItems"].as_u64().unwrap(),
        total: list["stats"]["totalItems"].as_u64().unwrap(),
        query: filters.query,
        unwatched: filters.unwatched,
        runs,
        paused: !list["pausedAt"].is_null(),
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
    let data = lists
        .discovery(
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
        lists: data["watchlists"]
            .as_array()
            .unwrap()
            .iter()
            .map(|list| ListRow {
                id: list["id"].as_i64().unwrap(),
                name: list["name"].as_str().unwrap().into(),
                total: list["stats"]["totalItems"].as_u64().unwrap(),
                watched: list["stats"]["watchedItems"].as_u64().unwrap(),
            })
            .collect(),
        query: filters.query,
        next: data["nextCursor"].as_str().unwrap_or("").into(),
    }
    .render()
    .map(Html)
    .map_err(failure)
}
