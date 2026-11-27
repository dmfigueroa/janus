//! Television expansion and single-episode addition over fixture TMDB HTTP.
//!
//! Season 0 is not requested. A failed season leaves no new rows. Episodes that
//! are already stored are skipped, and the write runs only after every season
//! response has returned.

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
            "janus-v2-tv-{}-{}.db",
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

fn show(name: Option<&str>, seasons: &[i64], poster: Option<&str>) -> Value {
    json!({
        "name": name,
        "poster_path": poster,
        "seasons": seasons.iter().map(|season| json!({"season_number": season})).collect::<Vec<_>>()
    })
}

fn episode(
    id: u64,
    name: &str,
    season: i64,
    number: i64,
    still: Option<&str>,
    vote: f64,
    runtime: i64,
) -> Value {
    json!({
        "id": id,
        "name": name,
        "season_number": season,
        "episode_number": number,
        "still_path": still,
        "air_date": "2024-01-01",
        "vote_average": vote,
        "runtime": runtime
    })
}

fn season(episodes: Vec<Value>) -> Value {
    json!({ "episodes": episodes })
}

fn routes() -> Vec<FixtureRoute> {
    let mut routes = vec![
        FixtureRoute {
            path_contains: "/tv/1399/season/1".into(),
            body: FixtureBody::Json(season(vec![
                episode(1001, "Pilot", 1, 1, Some("/pilot.jpg"), 7.2, 42),
                episode(1002, "Second Wave", 1, 2, None, 7.8, 44),
            ])),
        },
        FixtureRoute {
            path_contains: "/tv/1399/season/2".into(),
            body: FixtureBody::Json(season(vec![episode(
                2001,
                "Later Season",
                2,
                1,
                Some("/later.jpg"),
                8.0,
                40,
            )])),
        },
        FixtureRoute {
            path_contains: "/tv/1399".into(),
            body: FixtureBody::Json(show(Some("Canonical Show"), &[0, 1, 2], Some("/show.jpg"))),
        },
        FixtureRoute {
            path_contains: "/tv/43".into(),
            body: FixtureBody::Json(show(Some("Specials Only"), &[0], None)),
        },
        FixtureRoute {
            path_contains: "/tv/44".into(),
            body: FixtureBody::Json(json!({"invalid": true})),
        },
        FixtureRoute {
            path_contains: "/tv/45/season/2".into(),
            body: FixtureBody::Json(json!({"invalid": true})),
        },
        FixtureRoute {
            path_contains: "/tv/45/season/1".into(),
            body: FixtureBody::Json(season(vec![episode(4501, "Kept", 1, 1, None, 1.0, 20)])),
        },
        FixtureRoute {
            path_contains: "/tv/45".into(),
            body: FixtureBody::Json(show(Some("Broken Season"), &[1, 2], None)),
        },
        FixtureRoute {
            path_contains: "/movie/550".into(),
            body: FixtureBody::Json(json!({
                "title": "Partial Success",
                "poster_path": null,
                "release_date": "2024-02-03",
                "vote_average": 8.7,
                "runtime": 100
            })),
        },
        FixtureRoute {
            path_contains: "/tv/46/season/1".into(),
            body: FixtureBody::Json(season(vec![episode(4601, "Fallback", 1, 1, None, 1.0, 10)])),
        },
        FixtureRoute {
            path_contains: "/tv/46".into(),
            body: FixtureBody::Json(show(None, &[1], None)),
        },
        FixtureRoute {
            path_contains: "/tv/47/season/1".into(),
            body: FixtureBody::Json(season(vec![episode(4701, "Nameless", 1, 1, None, 1.0, 10)])),
        },
        FixtureRoute {
            path_contains: "/tv/47".into(),
            body: FixtureBody::Json(show(None, &[1], None)),
        },
    ];
    for season_number in 1_i64..=6 {
        routes.push(FixtureRoute {
            path_contains: format!("/tv/60/season/{season_number}"),
            body: FixtureBody::Json(season(vec![episode(
                6000 + season_number as u64,
                &format!("Season {season_number}"),
                season_number,
                1,
                None,
                1.0,
                10,
            )])),
        });
    }
    routes.push(FixtureRoute {
        path_contains: "/tv/60".into(),
        body: FixtureBody::Json(show(Some("Ordered"), &[0, 1, 2, 3, 4, 5, 6], None)),
    });
    routes
}

struct Harness {
    database: DatabaseConnection,
    transport: FixtureTransport,
    catalog: Arc<TmdbClient<FixtureTransport>>,
    app: axum::Router,
    session: String,
    _fixture: Fixture,
}

impl Harness {
    async fn new(api_key: Option<String>) -> Self {
        let fixture = Fixture::v1();
        let transport = FixtureTransport::new(routes());
        let database = janus_v2::open_database(&fixture.0).await.unwrap();
        let catalog = Arc::new(TmdbClient::with_key(transport.clone(), api_key));
        let app = janus_v2::database_router_with(database.clone(), catalog.clone());
        let session = init_session(&app).await;
        Self {
            database,
            transport,
            catalog,
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
    assert!(notified.status() == StatusCode::OK || notified.status() == StatusCode::ACCEPTED);
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
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}

fn structured(payload: &Value) -> Value {
    assert!(payload.get("error").is_none(), "{payload}");
    assert_ne!(payload["result"]["isError"], json!(true), "{payload}");
    let text: Value =
        serde_json::from_str(payload["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(text, payload["result"]["structuredContent"]);
    payload["result"]["structuredContent"].clone()
}

async fn ids(database: &DatabaseConnection, watchlist_id: i64) -> Vec<String> {
    let rows = database
        .query_all_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT tmdb_id FROM watchlist_items WHERE watchlist_id = ? AND parent_id LIKE 'tmdb:%' ORDER BY custom_rank, id",
            vec![watchlist_id.into()],
        ))
        .await
        .unwrap();
    rows.iter()
        .map(|row| row.try_get::<String>("", "tmdb_id").unwrap())
        .collect()
}

fn bare() -> InsertionIntent {
    InsertionIntent {
        position: None,
        reference_item_id: None,
    }
}

#[tokio::test]
async fn television_expansion_skips_specials_duplicates_and_failed_seasons() {
    let harness = Harness::new(Some("test-tmdb-key".into())).await;
    let blocked = structured(
        &call(
            &harness.app,
            &harness.session,
            3,
            json!({"additions": [{
                "watchlistId": 41,
                "provider": "tmdb",
                "providerId": "1399",
                "mediaType": "tv"
            }]}),
        )
        .await,
    );
    assert_eq!(blocked["results"][0]["code"], "insertion_choice_required");
    assert!(harness.transport.calls().is_empty());

    let invalid = structured(
        &call(
            &harness.app,
            &harness.session,
            4,
            json!({"additions": [{
                "watchlistId": 41,
                "provider": "tmdb",
                "providerId": "1399",
                "mediaType": "tv",
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
    assert!(ids(&harness.database, 41).await.is_empty());
    assert!(
        harness
            .transport
            .calls()
            .iter()
            .any(|call| call.url.contains("/tv/1399/season/1"))
    );
    assert!(
        !harness
            .transport
            .calls()
            .iter()
            .any(|call| call.url.contains("/season/0"))
    );

    let episode = structured(
        &call(
            &harness.app,
            &harness.session,
            5,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "1002",
                "mediaType": "episode",
                "parent": {"providerId": "tmdb:1399", "title": "Caller Title"}
            }]}),
        )
        .await,
    );
    assert_eq!(episode["results"][0]["code"], "added");
    assert_eq!(
        episode["results"][0]["message"],
        "Added 1 episode to watchlist"
    );
    assert_eq!(episode["results"][0]["affectedCount"], 1);
    let stored = harness
        .database
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT title, parent_id, parent_title, season, episode, poster_path, release_date, runtime, is_watched \
             FROM watchlist_items WHERE watchlist_id = 42 AND tmdb_id = '1002'",
            vec![],
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        stored.try_get::<String>("", "title").unwrap(),
        "Second Wave"
    );
    assert_eq!(
        stored.try_get::<String>("", "parent_id").unwrap(),
        "tmdb:1399"
    );
    assert_eq!(
        stored.try_get::<String>("", "parent_title").unwrap(),
        "Canonical Show"
    );
    assert_eq!(stored.try_get::<i64>("", "season").unwrap(), 1);
    assert_eq!(stored.try_get::<String>("", "episode").unwrap(), "2");
    assert_eq!(
        stored.try_get::<String>("", "poster_path").unwrap(),
        "/show.jpg"
    );
    assert_eq!(
        stored.try_get::<String>("", "release_date").unwrap(),
        "2024-01-01"
    );
    assert_eq!(stored.try_get::<i64>("", "runtime").unwrap(), 44);
    assert_eq!(stored.try_get::<i64>("", "is_watched").unwrap(), 0);

    let duplicate = structured(
        &call(
            &harness.app,
            &harness.session,
            6,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "1002",
                "mediaType": "episode",
                "parent": {"providerId": "1399"}
            }]}),
        )
        .await,
    );
    assert_eq!(duplicate["results"][0]["code"], "duplicate");
    assert_eq!(duplicate["results"][0]["message"], "Already in watchlist");
    assert_eq!(duplicate["results"][0]["affectedCount"], 0);

    let missing = structured(
        &call(
            &harness.app,
            &harness.session,
            7,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "9999",
                "mediaType": "episode",
                "parent": {"providerId": "1399"}
            }]}),
        )
        .await,
    );
    assert_eq!(missing["results"][0]["code"], "not_found");
    assert_eq!(
        missing["results"][0]["message"],
        "TMDB episode was not found for this show."
    );

    let expanded = structured(
        &call(
            &harness.app,
            &harness.session,
            8,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "1399",
                "mediaType": "tv"
            }]}),
        )
        .await,
    );
    assert_eq!(expanded["results"][0]["code"], "added");
    assert_eq!(expanded["results"][0]["affectedCount"], 2);
    assert_eq!(
        expanded["results"][0]["message"],
        "Added 2 new episodes to watchlist"
    );
    assert_eq!(
        ids(&harness.database, 42).await,
        vec!["1002".to_owned(), "1001".to_owned(), "2001".to_owned()]
    );

    let again = structured(
        &call(
            &harness.app,
            &harness.session,
            9,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "1399",
                "mediaType": "tv"
            }]}),
        )
        .await,
    );
    assert_eq!(again["results"][0]["code"], "no_new_items");
    assert_eq!(
        again["results"][0]["message"],
        "No new episodes found for this show"
    );
    assert_eq!(again["results"][0]["affectedCount"], 0);
    assert_eq!(ids(&harness.database, 42).await.len(), 3);

    let ordered = structured(
        &call(
            &harness.app,
            &harness.session,
            10,
            json!({"additions": [{
                "watchlistId": 41,
                "provider": "tmdb",
                "providerId": "60",
                "mediaType": "tv",
                "insertionPosition": "end"
            }]}),
        )
        .await,
    );
    assert_eq!(ordered["results"][0]["code"], "added");
    assert_eq!(ordered["results"][0]["affectedCount"], 6);
    assert_eq!(
        ordered["results"][0]["message"],
        "Added 6 new episodes to watchlist"
    );
    let ordered_ids = harness
        .database
        .query_all_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT tmdb_id FROM watchlist_items WHERE watchlist_id = 41 ORDER BY custom_rank",
            vec![],
        ))
        .await
        .unwrap();
    let ordered_ids: Vec<String> = ordered_ids
        .iter()
        .map(|row| row.try_get::<String>("", "tmdb_id").unwrap())
        .collect();
    assert_eq!(
        ordered_ids,
        vec![
            "ep-2".to_owned(),
            "ep-1".to_owned(),
            "book-1".to_owned(),
            "6001".to_owned(),
            "6002".to_owned(),
            "6003".to_owned(),
            "6004".to_owned(),
            "6005".to_owned(),
            "6006".to_owned(),
        ]
    );

    let specials = structured(
        &call(
            &harness.app,
            &harness.session,
            11,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "43",
                "mediaType": "tv"
            }]}),
        )
        .await,
    );
    assert_eq!(specials["results"][0]["code"], "no_new_items");
    assert_eq!(
        specials["results"][0]["message"],
        "No episodes found for this show"
    );
    assert!(
        !harness
            .transport
            .calls()
            .iter()
            .any(|call| call.url.contains("/tv/43/season"))
    );

    let broken_show = structured(
        &call(
            &harness.app,
            &harness.session,
            12,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "44",
                "mediaType": "tv"
            }]}),
        )
        .await,
    );
    assert_eq!(broken_show["results"][0]["code"], "provider_unavailable");
    assert!(
        !harness
            .transport
            .calls()
            .iter()
            .any(|call| call.url.contains("/tv/44/season"))
    );

    let batch = structured(
        &call(
            &harness.app,
            &harness.session,
            13,
            json!({"additions": [
                {"watchlistId": 42, "provider": "tmdb", "providerId": "45", "mediaType": "tv"},
                {"watchlistId": 42, "provider": "tmdb", "providerId": "550", "mediaType": "movie"}
            ]}),
        )
        .await,
    );
    assert_eq!(batch["results"][0]["index"], 0);
    assert_eq!(batch["results"][0]["code"], "provider_unavailable");
    assert_eq!(batch["results"][0]["affectedCount"], 0);
    assert_eq!(batch["results"][1]["index"], 1);
    assert_eq!(batch["results"][1]["code"], "added");
    assert_eq!(batch["results"][1]["affectedCount"], 1);
    assert!(
        ids(&harness.database, 42)
            .await
            .iter()
            .all(|id| id != "4501")
    );

    let lists = Watchlists(harness.database.clone());
    let config = ProviderConfig {
        rawg: false,
        google_books: false,
        comicvine: false,
    };
    let fallback = add_provider_media(
        &lists,
        harness.catalog.as_ref(),
        &config,
        &MediaAddition::Television {
            watchlist_id: 42,
            show_id: 46,
            title: "Search Title".into(),
            insertion: bare(),
        },
    )
    .await;
    assert_eq!(fallback.code(), "added");
    let fallback_title = harness
        .database
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT parent_title FROM watchlist_items WHERE tmdb_id = '4601'",
            vec![],
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        fallback_title
            .try_get::<String>("", "parent_title")
            .unwrap(),
        "Search Title"
    );
    let unknown = add_provider_media(
        &lists,
        harness.catalog.as_ref(),
        &config,
        &MediaAddition::Episode {
            watchlist_id: 42,
            episode_id: 4701,
            show_id: 47,
            show_title: None,
            insertion: bare(),
        },
    )
    .await;
    assert_eq!(unknown.code(), "added");
    assert_eq!(unknown.message(), "Added 1 episode to watchlist");
    let unknown_title = harness
        .database
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT parent_title FROM watchlist_items WHERE tmdb_id = '4701'",
            vec![],
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        unknown_title.try_get::<String>("", "parent_title").unwrap(),
        "Unknown Show"
    );
}

#[tokio::test]
async fn missing_tmdb_key_does_not_expand_a_show() {
    let harness = Harness::new(None).await;
    let missing = structured(
        &call(
            &harness.app,
            &harness.session,
            3,
            json!({"additions": [{
                "watchlistId": 42,
                "provider": "tmdb",
                "providerId": "1399",
                "mediaType": "tv"
            }]}),
        )
        .await,
    );
    assert_eq!(missing["results"][0]["code"], "provider_not_configured");
    assert!(harness.transport.calls().is_empty());
    assert!(ids(&harness.database, 42).await.is_empty());
}
