//! Public `search_media` envelopes over a fixture TMDB transport and a v1 database.

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use janus_v2::integrations::tmdb::{FixtureBody, FixtureRoute, FixtureTransport, TmdbClient};
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
            "janus-v2-search-{}-{}.db",
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

fn fight_club() -> Value {
    json!({
        "page": 1,
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

async fn init_session(app: &axum::Router) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/mcp")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("host", "localhost:3001")
                .body(Body::from(
                    json!({
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "initialize",
                        "params": {
                            "protocolVersion": "2025-03-26",
                            "capabilities": {},
                            "clientInfo": {"name": "search-test", "version": "1.0.0"}
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let session = response.headers()["mcp-session-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let _ = response.into_body().collect().await.unwrap();
    let notified = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/mcp")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("host", "localhost:3001")
                .header("mcp-session-id", &session)
                .body(Body::from(
                    json!({"jsonrpc": "2.0", "method": "notifications/initialized"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(
        notified.status() == StatusCode::OK || notified.status() == StatusCode::ACCEPTED,
        "{}",
        notified.status()
    );
    let _ = notified.into_body().collect().await.unwrap();
    session
}

async fn call(app: &axum::Router, session: &str, id: i64, arguments: Value) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/mcp")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("host", "localhost:3001")
                .header("mcp-session-id", session)
                .body(Body::from(
                    json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "method": "tools/call",
                        "params": {"name": "search_media", "arguments": arguments}
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

fn structured(payload: &Value) -> &Value {
    assert!(payload.get("error").is_none(), "{payload}");
    assert_ne!(payload["result"]["isError"], json!(true), "{payload}");
    let text: Value =
        serde_json::from_str(payload["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(&text, &payload["result"]["structuredContent"]);
    &payload["result"]["structuredContent"]
}

#[tokio::test]
async fn search_media_reports_tmdb_hits_and_the_non_calling_outcomes() {
    let fixture = Fixture::v1();
    let transport = FixtureTransport::new(vec![
        FixtureRoute {
            path_contains: "/search/movie".into(),
            body: FixtureBody::Json(fight_club()),
        },
        FixtureRoute {
            path_contains: "/search/tv".into(),
            body: FixtureBody::Json(json!({"invalid": true})),
        },
    ]);
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router_with(
        database,
        Arc::new(TmdbClient::with_key(
            transport.clone(),
            Some("test-tmdb-key".into()),
        )),
    );
    let session = init_session(&app).await;

    let listed = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/mcp")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("host", "localhost:3001")
                .header("mcp-session-id", &session)
                .body(Body::from(
                    json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let listed: Value =
        serde_json::from_slice(&listed.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let tool = listed["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .find(|tool| tool["name"] == "search_media")
        .unwrap();
    assert_eq!(tool["title"], "Search supported media providers");
    assert_eq!(
        tool["annotations"],
        json!({"readOnlyHint": true, "destructiveHint": false})
    );
    assert!(
        tool["description"]
            .as_str()
            .unwrap()
            .contains("TMDB for movies and TV")
    );

    let found_payload = call(
        &app,
        &session,
        3,
        json!({"query": "Fight Club", "mediaType": "movie", "page": 2}),
    )
    .await;
    let found = structured(&found_payload);
    assert_eq!(
        found,
        &json!({
            "success": true,
            "results": [{
                "provider": "tmdb",
                "providerId": "550",
                "mediaType": "movie",
                "title": "Fight Club",
                "releaseDate": "1999-10-15",
                "year": "1999",
                "overview": "An insomniac office worker forms an underground club.",
                "posterImage": "https://image.tmdb.org/t/p/w500/fight-club.jpg"
            }],
            "page": 2,
            "totalPages": 3,
            "totalResults": 41
        })
    );
    assert!(transport.calls()[0].url.contains("/search/movie"));
    assert!(transport.calls()[0].url.contains("page=2"));
    assert_eq!(transport.calls()[0].api_key, "test-tmdb-key");

    let empty_payload = call(
        &app,
        &session,
        4,
        json!({"query": "   ", "mediaType": "book"}),
    )
    .await;
    let empty = structured(&empty_payload);
    assert_eq!(
        empty,
        &json!({
            "success": false,
            "code": "empty_query",
            "message": "Enter a search term to find media."
        })
    );

    let deprecated_payload = call(
        &app,
        &session,
        5,
        json!({"query": "Cowboy Bebop", "mediaType": "anime"}),
    )
    .await;
    let deprecated = structured(&deprecated_payload);
    assert_eq!(
        deprecated,
        &json!({
            "success": false,
            "code": "deprecated_media_type",
            "message": "Anime and manga categories are deprecated while we revisit provider data quality."
        })
    );

    let game_payload = call(
        &app,
        &session,
        6,
        json!({"query": "Hades", "mediaType": "game", "page": 1}),
    )
    .await;
    let game = structured(&game_payload);
    assert_eq!(
        game,
        &json!({
            "success": false,
            "code": "provider_unavailable",
            "message": "Search is temporarily unavailable for this media type. Please try again later."
        })
    );

    let calls_before_malformed = transport.calls().len();
    let malformed_payload = call(
        &app,
        &session,
        7,
        json!({"query": "Thrones", "mediaType": "tv"}),
    )
    .await;
    let malformed = structured(&malformed_payload);
    assert_eq!(malformed["code"], "provider_unavailable");
    assert_eq!(malformed["success"], false);
    assert_eq!(transport.calls().len(), calls_before_malformed + 1);
    assert!(transport.calls().last().unwrap().url.contains("/search/tv"));
    assert_eq!(
        transport.calls().len(),
        2,
        "empty, deprecated, and game must not call TMDB"
    );
}
