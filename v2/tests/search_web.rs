//! `/v2/search` HTML and JSON: TMDB hits, non-calling outcomes, and watchlist adds.

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use janus_v2::integrations::tmdb::{FixtureBody, FixtureRoute, FixtureTransport, TmdbClient};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tower::ServiceExt;

static NEXT: AtomicUsize = AtomicUsize::new(0);

struct Fixture(PathBuf);

impl Fixture {
    fn v1() -> Self {
        let path = std::env::temp_dir().join(format!(
            "janus-v2-search-web-{}-{}.db",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let status = Command::new(std::env::var("JANUS_TEST_NODE").unwrap_or("node".into()))
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/create_v1_fixture.cjs"
            ))
            .arg(&path)
            .status()
            .unwrap();
        assert!(status.success(), "v1 fixture creation failed");
        Self(path)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
        let mut wal = self.0.as_os_str().to_os_string();
        wal.push("-wal");
        let _ = std::fs::remove_file(wal);
        let mut shm = self.0.as_os_str().to_os_string();
        shm.push("-shm");
        let _ = std::fs::remove_file(shm);
    }
}

struct Harness {
    database: DatabaseConnection,
    transport: FixtureTransport,
    app: axum::Router,
    _fixture: Fixture,
}

impl Harness {
    async fn new(routes: Vec<FixtureRoute>) -> Self {
        let fixture = Fixture::v1();
        let transport = FixtureTransport::new(routes);
        let database = janus_v2::open_database(&fixture.0).await.unwrap();
        let app = janus_v2::database_router_with(
            database.clone(),
            Arc::new(TmdbClient::with_key(
                transport.clone(),
                Some("fixture-key".into()),
            )),
        );
        Self {
            database,
            transport,
            app,
            _fixture: fixture,
        }
    }
}

fn fight_club() -> Value {
    json!({
        "page": 9,
        "total_pages": 3,
        "total_results": 41,
        "results": [{
            "id": 550,
            "title": "Fight Club",
            "poster_path": "/fight-club.jpg",
            "backdrop_path": "/backdrop.jpg",
            "release_date": "1999-10-15",
            "vote_average": 8.4,
            "overview": "An insomniac office worker forms an underground club."
        }]
    })
}

fn movie(title: &str) -> Value {
    json!({
        "title": title,
        "poster_path": "/canonical-poster.jpg",
        "release_date": "2024-02-03",
        "vote_average": 8.7,
        "runtime": 127
    })
}

async fn send(
    app: &axum::Router,
    method: &str,
    uri: &str,
    headers: &[(&str, &str)],
    body: &str,
) -> (StatusCode, axum::http::HeaderMap, String) {
    let mut builder = Request::builder().method(method).uri(uri);
    for (name, value) in headers {
        builder = builder.header(*name, *value);
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::from(body.to_owned())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, headers, String::from_utf8(bytes.to_vec()).unwrap())
}

async fn query(database: &DatabaseConnection, sql: &str) -> Vec<sea_orm::QueryResult> {
    database
        .query_all_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            vec![],
        ))
        .await
        .unwrap()
}

#[tokio::test]
async fn search_page_renders_hits_and_skips_provider_calls_for_local_outcomes() {
    let harness = Harness::new(vec![
        FixtureRoute {
            path_contains: "/search/movie".into(),
            body: FixtureBody::Json(fight_club()),
        },
        FixtureRoute {
            path_contains: "/search/tv".into(),
            body: FixtureBody::Json(json!({"invalid": true})),
        },
    ])
    .await;

    let (status, _, lists) = send(&harness.app, "GET", "/v2/watchlists", &[], "").await;
    assert_eq!(status, StatusCode::OK);
    assert!(lists.contains("href=\"/v2/watchlists\""));
    assert!(lists.contains("aria-current=\"page\""));
    assert!(lists.contains("href=\"/v2/search\""));
    assert!(
        !lists.contains("href=\"/v2/search\"\n    aria-current=\"page\""),
        "search is not the current destination on the watchlist page"
    );
    assert_eq!(harness.transport.calls().len(), 0);

    let (status, _, page) = send(&harness.app, "GET", "/v2/search", &[], "").await;
    assert_eq!(status, StatusCode::OK);
    assert!(page.contains("Discover"));
    assert!(page.contains("Find movies, shows, games, books, and comics."));
    assert!(page.contains(
        "Anime and manga categories are deprecated while we revisit provider data quality."
    ));
    assert!(page.contains("Enter a search term to find media."));
    assert!(page.contains("href=\"/v2/search\""));
    assert!(page.contains("aria-current=\"page\""));
    assert!(page.contains("hx-get=\"/v2/search\""));
    assert!(page.contains("hx-include=\"#search-query\""));
    assert!(page.contains("hx-target=\"#search-results\""));
    assert!(page.contains("hx-sync=\"#search-screen:replace\""));
    assert!(page.contains("Movies"));
    assert!(page.contains("aria-selected=\"true\""));
    assert!(page.contains("/v2/static/search-dialog.js"));
    assert!(page.contains("type=\"module\""));
    assert_eq!(harness.transport.calls().len(), 0);

    let (status, _, fragment) = send(
        &harness.app,
        "GET",
        "/v2/search?query=fight%20club&type=movie&page=2",
        &[("hx-request", "true"), ("hx-target", "search-results")],
        "",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(!fragment.contains("<!doctype"));
    assert!(fragment.contains("Fight Club"));
    assert!(fragment.contains("1999"));
    assert!(fragment.contains("8.4"));
    assert!(fragment.contains("https://image.tmdb.org/t/p/w500/fight-club.jpg"));
    assert!(fragment.contains("id=\"search-more\""));
    assert!(fragment.contains("hx-trigger=\"revealed\""));
    assert!(fragment.contains("hx-select=\".search-hit, #search-more\""));
    assert!(fragment.contains("page=3"));
    assert!(!fragment.contains(">Previous<"));
    assert!(!fragment.contains(">Next<"));
    assert!(fragment.contains("hx-get=\"/v2/search/detail\""));
    assert_eq!(harness.transport.calls().len(), 1);
    assert!(harness.transport.calls()[0].url.contains("page=2"));

    let (status, _, json_body) = send(
        &harness.app,
        "GET",
        "/v2/search?query=fight%20club&type=movie",
        &[("accept", "application/json")],
        "",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let payload: Value = serde_json::from_str(&json_body).unwrap();
    assert_eq!(payload["success"], json!(true));
    assert_eq!(payload["page"], json!(1));
    assert_eq!(payload["totalPages"], json!(3));
    assert_eq!(payload["totalResults"], json!(41));
    assert_eq!(payload["results"][0]["title"], json!("Fight Club"));
    assert_eq!(payload["results"][0]["provider"], json!("tmdb"));
    assert_eq!(payload["results"][0]["providerId"], json!("550"));
    assert_eq!(payload["results"][0]["mediaType"], json!("movie"));
    assert_eq!(
        payload["results"][0]["posterImage"],
        json!("https://image.tmdb.org/t/p/w500/fight-club.jpg")
    );

    let calls = harness.transport.calls().len();
    let (status, _, game) = send(
        &harness.app,
        "GET",
        "/v2/search?query=zelda&type=game",
        &[("hx-request", "true"), ("hx-target", "search-results")],
        "",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(game.contains(
        "Search is temporarily unavailable for this media type. Please try again later."
    ));
    assert!(game.contains("role=\"alert\""));
    assert_eq!(harness.transport.calls().len(), calls);

    let (status, _, anime) = send(
        &harness.app,
        "GET",
        "/v2/search?query=naruto&type=anime",
        &[("hx-request", "true"), ("hx-target", "search-screen")],
        "",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(anime.contains("Please switch to Movies, TV, Games, Books, or Comics."));
    assert!(anime.contains("id=\"search-screen\""));
    assert!(!anime.contains("<!doctype"));
    assert_eq!(harness.transport.calls().len(), calls);

    let (status, _, unavailable) = send(
        &harness.app,
        "GET",
        "/v2/search?query=show&type=tv",
        &[("accept", "application/json")],
        "",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let rejected: Value = serde_json::from_str(&unavailable).unwrap();
    assert_eq!(
        rejected,
        json!({
            "success": false,
            "code": "provider_unavailable",
            "message": "Search is temporarily unavailable for this media type. Please try again later."
        })
    );
}

#[tokio::test]
async fn detail_sheet_adds_a_movie_and_reports_destination_failures() {
    let harness = Harness::new(vec![
        FixtureRoute {
            path_contains: "/movie/550".into(),
            body: FixtureBody::Json(movie("Canonical Movie Title")),
        },
        FixtureRoute {
            path_contains: "/movie/552".into(),
            body: FixtureBody::Json(json!({"invalid": true})),
        },
    ])
    .await;

    let (status, _, detail) = send(
        &harness.app,
        "GET",
        "/v2/search/detail?provider=tmdb&providerId=1399&mediaType=tv&title=Canonical%20Show&year=2024&overview=A%20show&poster=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw500%2Fshow.jpg",
        &[("hx-request", "true")],
        "",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(detail.contains("Canonical Show"));
    assert!(detail.contains("TV Series"));
    assert!(detail.contains("Café"));
    assert!(detail.contains("&#60;collection&#62;"));
    assert!(detail.contains("data-order=\"custom\""));
    assert!(detail.contains("data-order=\"release\""));
    assert!(detail.contains("id=\"search-insertion\""));
    assert!(detail.contains("Insert in custom order"));
    assert!(detail.contains("Beginning"));
    assert!(detail.contains("End"));
    assert!(detail.contains("Adding a TV show"));
    assert!(detail.contains("all available episodes"));
    assert!(detail.contains("hx-post=\"/v2/search/add\""));
    assert!(detail.contains("commandfor=\"search-dialog\""));
    assert!(detail.contains("data-watchlist-combobox"));
    assert!(detail.contains("role=\"combobox\""));
    assert!(detail.contains("id=\"search-watchlist-listbox\""));
    assert!(detail.contains("name=\"watchlistId\""));
    assert_eq!(harness.transport.calls().len(), 0);

    let (status, _, missing) = send(
        &harness.app,
        "POST",
        "/v2/search/add",
        &[
            ("content-type", "application/json"),
            ("accept", "application/json"),
        ],
        &json!({
            "watchlistId": 999,
            "provider": "tmdb",
            "providerId": "550",
            "mediaType": "movie",
            "title": "Fight Club"
        })
        .to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let missing_body: Value = serde_json::from_str(&missing).unwrap();
    assert_eq!(missing_body["code"], json!("not_found"));
    assert_eq!(missing_body["message"], json!("Watchlist not found."));
    assert_eq!(harness.transport.calls().len(), 0);

    let (status, _, choice) = send(
        &harness.app,
        "POST",
        "/v2/search/add",
        &[
            ("content-type", "application/x-www-form-urlencoded"),
            ("hx-request", "true"),
        ],
        "watchlistId=41&provider=tmdb&providerId=550&mediaType=movie&title=Fight%20Club",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(choice.contains("Choose where to insert this item in the custom order."));
    assert!(choice.contains("id=\"search-add-alert\""));
    assert_eq!(harness.transport.calls().len(), 0);

    let (status, headers, body) = send(
        &harness.app,
        "POST",
        "/v2/search/add",
        &[
            ("content-type", "application/x-www-form-urlencoded"),
            ("hx-request", "true"),
        ],
        "watchlistId=42&provider=tmdb&providerId=550&mediaType=movie&title=Fight%20Club",
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(body.is_empty());
    let trigger = headers["hx-trigger"].to_str().unwrap();
    assert!(trigger.contains("search-added"));
    assert!(trigger.contains("Added to watchlist"));
    assert_eq!(harness.transport.calls().len(), 1);
    assert!(harness.transport.calls()[0].url.contains("/movie/550"));

    let rows = query(
        &harness.database,
        "SELECT title, poster_path, is_watched, media_type FROM watchlist_items \
         WHERE watchlist_id = 42 AND tmdb_id = '550'",
    )
    .await;
    assert_eq!(rows.len(), 1);
    assert_eq!(
        rows[0].try_get::<String>("", "title").unwrap(),
        "Canonical Movie Title"
    );
    assert_eq!(
        rows[0].try_get::<Option<i64>>("", "is_watched").unwrap(),
        Some(0)
    );

    let (status, _, duplicate) = send(
        &harness.app,
        "POST",
        "/v2/search/add",
        &[
            ("content-type", "application/json"),
            ("accept", "application/json"),
        ],
        &json!({
            "watchlistId": 42,
            "provider": "tmdb",
            "providerId": "550",
            "mediaType": "movie"
        })
        .to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let duplicate_body: Value = serde_json::from_str(&duplicate).unwrap();
    assert_eq!(
        duplicate_body,
        json!({
            "success": true,
            "code": "duplicate",
            "message": "Already in watchlist",
            "affectedCount": 0
        })
    );
    assert_eq!(harness.transport.calls().len(), 1);

    let (status, _, unavailable) = send(
        &harness.app,
        "POST",
        "/v2/search/add",
        &[
            ("content-type", "application/json"),
            ("accept", "application/json"),
        ],
        &json!({
            "watchlistId": 42,
            "provider": "tmdb",
            "providerId": "552",
            "mediaType": "movie"
        })
        .to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    let unavailable_body: Value = serde_json::from_str(&unavailable).unwrap();
    assert_eq!(unavailable_body["code"], json!("provider_unavailable"));
    let leftover = query(
        &harness.database,
        "SELECT count(*) AS total FROM watchlist_items WHERE tmdb_id = '552'",
    )
    .await;
    assert_eq!(leftover[0].try_get::<i64>("", "total").unwrap(), 0);
}
