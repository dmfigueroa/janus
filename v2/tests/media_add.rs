//! Public `add_media_to_watchlists` outcomes over a fixture TMDB transport.
//!
//! Movie fetches finish before any write. A failed fetch leaves the watchlist
//! unchanged. Other providers stay configuration stubs and never leave the process.

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use janus_v2::Watchlists;
use janus_v2::addition::{InsertionIntent, MediaAddition, ProviderConfig, add_provider_media};
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
            "janus-v2-add-{}-{}.db",
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

fn canonical_movie() -> Value {
    json!({
        "title": "Canonical Movie Title",
        "poster_path": "/canonical-poster.jpg",
        "release_date": "2024-02-03",
        "vote_average": 8.7,
        "runtime": 127
    })
}

fn titled(title: &str) -> Value {
    json!({
        "title": title,
        "poster_path": null,
        "release_date": "2024-02-03",
        "vote_average": 1,
        "runtime": 90
    })
}

struct Harness {
    database: DatabaseConnection,
    transport: FixtureTransport,
    app: axum::Router,
    session: String,
    _fixture: Fixture,
}

impl Harness {
    async fn new(routes: Vec<FixtureRoute>, api_key: Option<String>) -> Self {
        let fixture = Fixture::v1();
        let transport = FixtureTransport::new(routes);
        let database = janus_v2::open_database(&fixture.0).await.unwrap();
        let app = janus_v2::database_router_with(
            database.clone(),
            Arc::new(TmdbClient::with_key(transport.clone(), api_key)),
        );
        let session = init_session(&app).await;
        Self {
            database,
            transport,
            app,
            session,
            _fixture: fixture,
        }
    }
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
                            "clientInfo": {"name": "janus-test", "version": "0"}
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let session = response
        .headers()
        .get("mcp-session-id")
        .unwrap()
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
                        "params": {"name": "add_media_to_watchlists", "arguments": arguments}
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

fn structured(payload: &Value) -> Value {
    assert!(payload.get("error").is_none(), "{payload}");
    assert_ne!(payload["result"]["isError"], json!(true), "{payload}");
    let text: Value =
        serde_json::from_str(payload["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(text, payload["result"]["structuredContent"]);
    payload["result"]["structuredContent"].clone()
}

async fn query(
    database: &DatabaseConnection,
    sql: &str,
    values: Vec<sea_orm::Value>,
) -> Vec<sea_orm::QueryResult> {
    database
        .query_all_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            values,
        ))
        .await
        .unwrap()
}

async fn movie_count(database: &DatabaseConnection, watchlist_id: i64, tmdb_id: &str) -> i64 {
    let rows = query(
        database,
        "SELECT count(*) AS total FROM watchlist_items WHERE watchlist_id = ? AND tmdb_id = ? AND media_type = 'movie'",
        vec![watchlist_id.into(), tmdb_id.to_owned().into()],
    )
    .await;
    rows[0].try_get("", "total").unwrap()
}

#[tokio::test]
async fn movie_add_persists_canonical_metadata_and_a_duplicate_does_not_refetch() {
    let harness = Harness::new(
        vec![FixtureRoute {
            path_contains: "/movie/550".into(),
            body: FixtureBody::Json(canonical_movie()),
        }],
        Some("test-tmdb-key".into()),
    )
    .await;
    let listed = harness
        .app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/mcp")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("host", "localhost:3001")
                .header("mcp-session-id", &harness.session)
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
        .find(|tool| tool["name"] == "add_media_to_watchlists")
        .unwrap();
    assert_eq!(tool["title"], "Add provider-backed media to watchlists");
    assert_eq!(
        tool["annotations"],
        json!({"readOnlyHint": false, "destructiveHint": false, "idempotentHint": false})
    );
    assert!(
        tool["description"]
            .as_str()
            .unwrap()
            .contains("TV additions expand into episodes")
    );

    let added_payload = call(
        &harness.app,
        &harness.session,
        3,
        json!({"additions": [{
            "watchlistId": 42,
            "provider": "tmdb",
            "providerId": "550",
            "mediaType": "movie"
        }]}),
    )
    .await;
    let added = structured(&added_payload);
    assert_eq!(
        added["results"][0],
        json!({
            "index": 0,
            "success": true,
            "code": "added",
            "message": "Added to watchlist",
            "watchlistId": 42,
            "provider": "tmdb",
            "providerId": "550",
            "affectedCount": 1
        })
    );
    assert_eq!(harness.transport.calls().len(), 1);
    assert!(harness.transport.calls()[0].url.contains("/movie/550"));
    assert!(!harness.transport.calls()[0].url.contains("?"));

    let rows = query(
        &harness.database,
        "SELECT title, poster_path, release_date, runtime, is_watched, vote_average, source, media_type \
         FROM watchlist_items WHERE watchlist_id = 42 AND tmdb_id = '550'",
        vec![],
    )
    .await;
    assert_eq!(rows.len(), 1);
    assert_eq!(
        rows[0].try_get::<String>("", "title").unwrap(),
        "Canonical Movie Title"
    );
    assert_eq!(
        rows[0]
            .try_get::<Option<String>>("", "poster_path")
            .unwrap()
            .as_deref(),
        Some("/canonical-poster.jpg")
    );
    assert_eq!(
        rows[0]
            .try_get::<Option<String>>("", "release_date")
            .unwrap()
            .as_deref(),
        Some("2024-02-03")
    );
    assert_eq!(
        rows[0].try_get::<Option<i64>>("", "runtime").unwrap(),
        Some(127)
    );
    assert_eq!(
        rows[0].try_get::<Option<i64>>("", "is_watched").unwrap(),
        Some(0)
    );
    assert_eq!(rows[0].try_get::<String>("", "source").unwrap(), "tmdb");
    assert_eq!(
        rows[0].try_get::<String>("", "media_type").unwrap(),
        "movie"
    );
    let vote: f64 = rows[0].try_get("", "vote_average").unwrap();
    assert!((vote - 8.7).abs() < 0.001);

    let stamped = query(
        &harness.database,
        "SELECT last_item_added_at FROM watchlists WHERE id = 42",
        vec![],
    )
    .await;
    assert!(
        stamped[0]
            .try_get::<Option<String>>("", "last_item_added_at")
            .unwrap()
            .is_some()
    );

    let duplicate_payload = call(
        &harness.app,
        &harness.session,
        4,
        json!({"additions": [{
            "watchlistId": 42,
            "provider": "tmdb",
            "providerId": "550",
            "mediaType": "movie"
        }]}),
    )
    .await;
    let duplicate = structured(&duplicate_payload);
    assert_eq!(duplicate["results"][0]["code"], "duplicate");
    assert_eq!(duplicate["results"][0]["message"], "Already in watchlist");
    assert_eq!(duplicate["results"][0]["affectedCount"], 0);
    assert_eq!(duplicate["results"][0]["success"], true);
    assert_eq!(harness.transport.calls().len(), 1);
    assert_eq!(movie_count(&harness.database, 42, "550").await, 1);
}

#[tokio::test]
async fn destination_failures_do_not_call_tmdb_and_custom_beginning_renumbers() {
    let harness = Harness::new(
        vec![
            FixtureRoute {
                path_contains: "/movie/550".into(),
                body: FixtureBody::Json(canonical_movie()),
            },
            FixtureRoute {
                path_contains: "/movie/551".into(),
                body: FixtureBody::Json(canonical_movie()),
            },
        ],
        Some("test-tmdb-key".into()),
    )
    .await;
    let missing = structured(
        &call(
            &harness.app,
            &harness.session,
            3,
            json!({"additions": [{
                "watchlistId": 999999,
                "provider": "tmdb",
                "providerId": "550",
                "mediaType": "movie"
            }]}),
        )
        .await,
    );
    assert_eq!(missing["results"][0]["code"], "not_found");
    assert_eq!(missing["results"][0]["message"], "Watchlist not found.");
    assert_eq!(missing["results"][0]["affectedCount"], 0);

    let choice = structured(
        &call(
            &harness.app,
            &harness.session,
            4,
            json!({"additions": [{
                "watchlistId": 41,
                "provider": "tmdb",
                "providerId": "550",
                "mediaType": "movie"
            }]}),
        )
        .await,
    );
    assert_eq!(choice["results"][0]["code"], "insertion_choice_required");
    assert_eq!(
        choice["results"][0]["message"],
        "Choose where to insert this item in the custom order."
    );

    let anchor = structured(
        &call(
            &harness.app,
            &harness.session,
            5,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "550",
                "mediaType": "movie",
                "insertionPosition": "before",
                "referenceItemId": 101
            }]}),
        )
        .await,
    );
    assert_eq!(anchor["results"][0]["code"], "not_custom_mode");
    assert_eq!(
        anchor["results"][0]["message"],
        "Anchored insertion is only available in custom mode."
    );
    assert!(harness.transport.calls().is_empty());
    assert_eq!(movie_count(&harness.database, 42, "550").await, 0);
    assert_eq!(movie_count(&harness.database, 41, "550").await, 0);

    let added = structured(
        &call(
            &harness.app,
            &harness.session,
            6,
            json!({"additions": [{
                "watchlistId": 41,
                "provider": "tmdb",
                "providerId": "550",
                "mediaType": "movie",
                "insertionPosition": "beginning"
            }]}),
        )
        .await,
    );
    assert_eq!(added["results"][0]["code"], "added");
    assert_eq!(added["results"][0]["affectedCount"], 1);
    assert_eq!(harness.transport.calls().len(), 1);

    let ranks = query(
        &harness.database,
        "SELECT tmdb_id, custom_rank FROM watchlist_items WHERE watchlist_id = 41 ORDER BY custom_rank",
        vec![],
    )
    .await;
    let ranks: Vec<(String, i64)> = ranks
        .iter()
        .map(|row| {
            (
                row.try_get::<String>("", "tmdb_id").unwrap(),
                row.try_get::<i64>("", "custom_rank").unwrap(),
            )
        })
        .collect();
    assert_eq!(
        ranks,
        vec![
            ("550".into(), 1),
            ("ep-2".into(), 2),
            ("ep-1".into(), 3),
            ("book-1".into(), 4),
        ]
    );

    let invalid = structured(
        &call(
            &harness.app,
            &harness.session,
            7,
            json!({"additions": [{
                "watchlistId": 41,
                "provider": "tmdb",
                "providerId": "551",
                "mediaType": "movie",
                "insertionPosition": "before",
                "referenceItemId": 999
            }]}),
        )
        .await,
    );
    assert_eq!(invalid["results"][0]["code"], "invalid_reference");
    assert_eq!(
        invalid["results"][0]["message"],
        "Reference item 999 is not in this watchlist."
    );
    assert_eq!(harness.transport.calls().len(), 2);
    assert!(harness.transport.calls()[1].url.contains("/movie/551"));
    assert_eq!(movie_count(&harness.database, 41, "551").await, 0);
    let ranks_after = query(
        &harness.database,
        "SELECT tmdb_id, custom_rank FROM watchlist_items WHERE watchlist_id = 41 ORDER BY custom_rank",
        vec![],
    )
    .await;
    let ranks_after: Vec<(String, i64)> = ranks_after
        .iter()
        .map(|row| {
            (
                row.try_get::<String>("", "tmdb_id").unwrap(),
                row.try_get::<i64>("", "custom_rank").unwrap(),
            )
        })
        .collect();
    assert_eq!(ranks_after, ranks);
}

#[tokio::test]
async fn provider_failures_leave_no_rows_and_batches_stay_isolated() {
    let harness = Harness::new(
        vec![
            FixtureRoute {
                path_contains: "/movie/550".into(),
                body: FixtureBody::Json(canonical_movie()),
            },
            FixtureRoute {
                path_contains: "/movie/700".into(),
                body: FixtureBody::Json(titled("Keep this addition")),
            },
            FixtureRoute {
                path_contains: "/movie/701".into(),
                body: FixtureBody::Json(titled("Fail this addition")),
            },
            FixtureRoute {
                path_contains: "/movie/702".into(),
                body: FixtureBody::Json(titled("Keep this addition")),
            },
            FixtureRoute {
                path_contains: "/movie/404".into(),
                body: FixtureBody::Json(json!({"invalid": true})),
            },
        ],
        Some("test-tmdb-key".into()),
    )
    .await;

    let malformed = structured(
        &call(
            &harness.app,
            &harness.session,
            3,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "404",
                "mediaType": "movie"
            }]}),
        )
        .await,
    );
    assert_eq!(malformed["results"][0]["code"], "provider_unavailable");
    assert_eq!(
        malformed["results"][0]["message"],
        "TMDB is temporarily unavailable. Please try again later."
    );
    assert_eq!(movie_count(&harness.database, 42, "404").await, 0);
    assert_eq!(harness.transport.calls().len(), 1);

    let batch = structured(
        &call(
            &harness.app,
            &harness.session,
            4,
            json!({"additions": [
                {"watchlistId": 42, "provider": "tmdb", "providerId": "550", "mediaType": "movie"},
                {"watchlistId": 999999, "provider": "tmdb", "providerId": "550", "mediaType": "movie"}
            ]}),
        )
        .await,
    );
    assert_eq!(batch["results"][0]["index"], 0);
    assert_eq!(batch["results"][0]["code"], "added");
    assert_eq!(batch["results"][0]["affectedCount"], 1);
    assert_eq!(batch["results"][1]["index"], 1);
    assert_eq!(batch["results"][1]["code"], "not_found");
    assert_eq!(batch["results"][1]["affectedCount"], 0);
    assert_eq!(movie_count(&harness.database, 42, "550").await, 1);

    harness
        .database
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "CREATE TRIGGER fail_one_addition BEFORE INSERT ON watchlist_items \
             WHEN NEW.title = 'Fail this addition' BEGIN SELECT RAISE(ABORT, 'forced defect'); END",
            vec![],
        ))
        .await
        .unwrap();
    let additions: Vec<Value> = ["700", "701", "702"]
        .into_iter()
        .map(|id| {
            json!({
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": id,
                "mediaType": "movie"
            })
        })
        .collect();
    let isolated = structured(
        &call(
            &harness.app,
            &harness.session,
            5,
            json!({ "additions": additions }),
        )
        .await,
    );
    assert_eq!(isolated["results"][0]["code"], "added");
    assert_eq!(isolated["results"][1]["code"], "internal_error");
    assert_eq!(
        isolated["results"][1]["message"],
        "The addition failed unexpectedly."
    );
    assert_eq!(isolated["results"][1]["affectedCount"], 0);
    assert_eq!(isolated["results"][2]["code"], "added");
    assert_eq!(movie_count(&harness.database, 42, "700").await, 1);
    assert_eq!(movie_count(&harness.database, 42, "701").await, 0);
    assert_eq!(movie_count(&harness.database, 42, "702").await, 1);
}

#[tokio::test]
async fn missing_tmdb_key_does_not_call_or_write() {
    let harness = Harness::new(
        vec![FixtureRoute {
            path_contains: "/movie/550".into(),
            body: FixtureBody::Json(canonical_movie()),
        }],
        None,
    )
    .await;
    let missing = structured(
        &call(
            &harness.app,
            &harness.session,
            3,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "550",
                "mediaType": "movie"
            }]}),
        )
        .await,
    );
    assert_eq!(missing["results"][0]["code"], "provider_not_configured");
    assert_eq!(
        missing["results"][0]["message"],
        "TMDB additions are unavailable because the integration is not configured."
    );
    assert!(harness.transport.calls().is_empty());
    assert_eq!(movie_count(&harness.database, 42, "550").await, 0);
}

#[tokio::test]
async fn other_providers_keep_configuration_codes_without_http() {
    let fixture = Fixture::v1();
    let transport = FixtureTransport::new(vec![]);
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let catalog = TmdbClient::with_key(transport.clone(), Some("unused".into()));
    let lists = Watchlists(database);
    let none = ProviderConfig {
        rawg: false,
        google_books: false,
        comicvine: false,
    };
    let configured = ProviderConfig {
        rawg: true,
        google_books: true,
        comicvine: true,
    };
    let bare = InsertionIntent {
        position: None,
        reference_item_id: None,
    };
    let cases = [
        (
            MediaAddition::Game {
                watchlist_id: 42,
                insertion: bare.clone(),
            },
            &none,
            "provider_not_configured",
            "Game additions are unavailable because the RAWG integration is not configured.",
        ),
        (
            MediaAddition::Book {
                watchlist_id: 42,
                insertion: bare.clone(),
            },
            &none,
            "provider_not_configured",
            "Google Books additions are unavailable because the integration is not configured.",
        ),
        (
            MediaAddition::Comic {
                watchlist_id: 42,
                insertion: bare.clone(),
            },
            &none,
            "provider_not_configured",
            "Comic additions are unavailable because the ComicVine integration is not configured.",
        ),
        (
            MediaAddition::Game {
                watchlist_id: 42,
                insertion: bare.clone(),
            },
            &configured,
            "provider_unavailable",
            "RAWG is temporarily unavailable. Please try again later.",
        ),
        (
            MediaAddition::Book {
                watchlist_id: 42,
                insertion: bare.clone(),
            },
            &configured,
            "provider_unavailable",
            "Google Books is temporarily unavailable. Please try again later.",
        ),
        (
            MediaAddition::Comic {
                watchlist_id: 42,
                insertion: bare.clone(),
            },
            &configured,
            "provider_unavailable",
            "ComicVine is temporarily unavailable. Please try again later.",
        ),
        (
            MediaAddition::Deprecated {
                watchlist_id: 42,
                insertion: bare.clone(),
            },
            &none,
            "unsupported",
            "Anime and manga categories are deprecated while we revisit provider data quality. New anime and manga items cannot be added to watchlists.",
        ),
        (
            MediaAddition::Deprecated {
                watchlist_id: 41,
                insertion: bare.clone(),
            },
            &none,
            "insertion_choice_required",
            "Choose where to insert this item in the custom order.",
        ),
    ];
    for (addition, config, code, message) in cases {
        let result = add_provider_media(&lists, &catalog, config, &addition).await;
        assert_eq!(result.code(), code);
        assert_eq!(result.message(), message);
        assert_eq!(result.affected_count(), 0);
    }
    assert!(transport.calls().is_empty());
}

#[tokio::test]
async fn empty_additions_are_a_tool_error() {
    let harness = Harness::new(vec![], Some("test-tmdb-key".into())).await;
    let payload = call(&harness.app, &harness.session, 3, json!({"additions": []})).await;
    assert_eq!(payload["result"]["isError"], json!(true));
    assert!(
        payload["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("additions must be a non-empty array")
    );
}
