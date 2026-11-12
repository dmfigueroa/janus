use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};
use tower::ServiceExt;
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn empty() -> Self {
        Self(std::env::temp_dir().join(format!(
            "janus-v2-{}-{}.db",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        )))
    }
    fn v1() -> Self {
        let fixture = Self::empty();
        let status = Command::new(std::env::var("JANUS_TEST_NODE").unwrap_or("node".into()))
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/create_v1_fixture.cjs"
            ))
            .arg(&fixture.0)
            .status()
            .unwrap();
        assert!(
            status.success(),
            "v1 fixture creation requires installed npm dependencies and the supported Node ABI"
        );
        fixture
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
#[tokio::test]
async fn missing_database_is_rejected_without_creating_it() {
    let fixture = Fixture::empty();
    assert!(!fixture.0.exists());
    assert!(janus_v2::open_database(&fixture.0).await.is_err());
    assert!(!fixture.0.exists());
}
#[tokio::test]
async fn incompatible_database_is_rejected_without_modification() {
    let fixture = Fixture::empty();
    std::fs::write(&fixture.0, b"not a SQLite database").unwrap();
    assert!(janus_v2::open_database(&fixture.0).await.is_err());
    assert_eq!(std::fs::read(&fixture.0).unwrap(), b"not a SQLite database");
}
async fn body(response: axum::response::Response) -> String {
    String::from_utf8(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap()
}
#[tokio::test]
async fn existing_watchlist_renders_ids_order_filters_and_escaped_content_without_writes() {
    let fixture = Fixture::v1();
    let before = std::fs::read(&fixture.0).unwrap();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database);
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists/41")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let html = body(response).await;
    assert!(html.contains("Café 東京 &#60;collection&#62;"), "{html}");
    assert!(html.contains("Opening &#60;script&#62;"));
    assert!(!html.contains("Opening <script>"));
    assert!(
        html.find("data-item-id=\"102\"").unwrap() < html.find("data-item-id=\"101\"").unwrap()
    );
    assert!(
        html.find("data-item-id=\"101\"").unwrap() < html.find("data-item-id=\"103\"").unwrap()
    );
    let filtered = body(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri("/v2/watchlists/41?query=show&unwatched=true")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap(),
    )
    .await;
    assert!(filtered.contains("data-item-id=\"101\""));
    assert!(filtered.contains("<details class=\"watched-run\">"));
    assert!(!filtered.contains("data-item-id=\"103\""));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists/999")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        std::fs::read(&fixture.0).unwrap(),
        before,
        "reads must preserve database bytes, schema and migration metadata"
    );
}
async fn rpc(
    app: &axum::Router,
    message: Value,
    session: Option<&str>,
) -> axum::response::Response {
    let mut request = Request::builder()
        .method("POST")
        .uri("/v2/mcp")
        .header("content-type", "application/json")
        .header("accept", "application/json, text/event-stream")
        .header("host", "localhost:3001");
    if let Some(session) = session {
        request = request.header("mcp-session-id", session);
    }
    app.clone()
        .oneshot(request.body(Body::from(message.to_string())).unwrap())
        .await
        .unwrap()
}
async fn result(response: axum::response::Response) -> Value {
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "application/json");
    serde_json::from_str::<Value>(&body(response).await).unwrap()["result"].clone()
}

#[tokio::test]
async fn mcp_discovers_and_reads_existing_watchlist_with_baseline_envelopes_and_pagination() {
    let fixture = Fixture::v1();
    let app = janus_v2::database_router(janus_v2::open_database(&fixture.0).await.unwrap());
    let response=rpc(&app,json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"read-test","version":"1"}}}),None).await;
    assert_eq!(response.headers()["content-type"], "application/json");
    let session = response.headers()["mcp-session-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let _ = result(response).await;
    let _ = rpc(
        &app,
        json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
        Some(&session),
    )
    .await;
    let tools = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(tools["tools"].as_array().unwrap().len(), 4);
    let read=result(rpc(&app,json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41,"pageSize":1}}}),Some(&session)).await).await;
    assert!(read.get("resultType").is_none());
    assert!(read.get("isError").is_none());
    let data = &read["structuredContent"];
    assert_eq!(data["items"][0]["id"], 102);
    assert_eq!(data["watchlist"]["stats"]["watchedItems"], 1);
    assert_eq!(data["watchlist"]["createdAt"], "2020-01-01 12:30:00");
    assert_eq!(data["watchlist"]["updatedAt"], "2020-01-01T12:30:00.000Z");
    assert_eq!(
        data["watchlist"]["stats"]["nextUnwatched"]["authors"],
        json!(["Écrivain", "著者"])
    );
    assert_eq!(
        serde_json::from_str::<Value>(read["content"][0]["text"].as_str().unwrap()).unwrap(),
        *data
    );
    assert!(data["orderToken"].as_str().unwrap().starts_with("sha256:"));
    let second=result(rpc(&app,json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41,"pageSize":1,"cursor":data["nextCursor"]}}}),Some(&session)).await).await;
    assert_eq!(second["structuredContent"]["items"][0]["id"], 101);
    assert!(second["structuredContent"]["items"][0]["isWatched"].is_null());
    let search=result(rpc(&app,json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"search_watchlists","arguments":{"query":"CAFÉ"}}}),Some(&session)).await).await;
    assert_eq!(search["structuredContent"]["watchlists"][0]["id"], 41);
    let titles=result(rpc(&app,json!({"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41,"resultView":"titles"}}}),Some(&session)).await).await;
    assert_eq!(
        titles["structuredContent"]["titles"][0]["matchingItemCount"],
        2
    );
    assert_eq!(
        titles["structuredContent"]["titles"][0]["providerId"],
        "show-1"
    );
    let bad_cursor=result(rpc(&app,json!({"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41,"pageSize":2,"cursor":data["nextCursor"]}}}),Some(&session)).await).await;
    assert_eq!(bad_cursor["isError"], true);
    let find=result(rpc(&app,json!({"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"find_watchlist_items","arguments":{"watchlistId":41,"query":"SHOW","resultView":"titles"}}}),Some(&session)).await).await;
    assert_eq!(
        find["structuredContent"]["titles"][0]["matchingItemCount"],
        2
    );
    let invalid_selector=result(rpc(&app,json!({"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"find_watchlist_items","arguments":{"watchlistId":41,"watchlistItemId":101,"pageSize":1}}}),Some(&session)).await).await;
    assert_eq!(invalid_selector["isError"], true);

    for (name, arguments) in [
        ("list_watchlists", json!({"order":123})),
        ("get_watchlist", json!({"watchlistId":41,"resultView":123})),
        (
            "find_watchlist_items",
            json!({"watchlistId":999999,"watchlistItemId":-1}),
        ),
    ] {
        let response=result(rpc(&app,json!({"jsonrpc":"2.0","id":20,"method":"tools/call","params":{"name":name,"arguments":arguments}}),Some(&session)).await).await;
        assert_eq!(response["isError"], true, "{response}");
    }
    let coerced=result(rpc(&app,json!({"jsonrpc":"2.0","id":24,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":"41.0","pageSize":1.0}}}),Some(&session)).await).await;
    assert_eq!(coerced["structuredContent"]["items"][0]["id"], 102);
    for selector in [json!("0x29"), json!(["41"]), json!(41.0)] {
        let response = result(rpc(&app, json!({"jsonrpc":"2.0","id":25,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":selector,"pageSize":1,"query":false,"ignored":123}}}), Some(&session)).await).await;
        assert_eq!(response["structuredContent"]["items"][0]["id"], 102);
    }
    let greek=result(rpc(&app,json!({"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"search_watchlists","arguments":{"query":"ος"}}}),Some(&session)).await).await;
    assert_eq!(greek["structuredContent"]["watchlists"][0]["id"], 42);
    for (name, arguments) in [
        (
            "get_watchlist",
            json!({"watchlistId":41,"resultView":"titles","pageSize":1}),
        ),
        (
            "find_watchlist_items",
            json!({"watchlistId":41,"query":"show","pageSize":1}),
        ),
    ] {
        let response=result(rpc(&app,json!({"jsonrpc":"2.0","id":22,"method":"tools/call","params":{"name":name,"arguments":arguments}}),Some(&session)).await).await;
        let cursor = &response["structuredContent"]["nextCursor"];
        assert!(cursor.is_string(), "{response}");
        let crossed=result(rpc(&app,json!({"jsonrpc":"2.0","id":23,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41,"pageSize":1,"cursor":cursor}}}),Some(&session)).await).await;
        assert_eq!(crossed["isError"], true, "{crossed}");
    }
    let unknown = rpc(
        &app,
        json!({"jsonrpc":"2.0","id":10,"method":"tools/list"}),
        Some("missing-session"),
    )
    .await;
    assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
    let terminated = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/v2/mcp")
                .header("mcp-session-id", &session)
                .header("host", "localhost:3001")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(terminated.status(), StatusCode::OK);
    assert_eq!(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":11,"method":"tools/list"}),
            Some(&session)
        )
        .await
        .status(),
        StatusCode::NOT_FOUND
    );
}

fn change_v1(fixture: &Fixture, action: &str) {
    assert!(
        Command::new(std::env::var("JANUS_TEST_NODE").unwrap_or("node".into()))
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/create_v1_fixture.cjs"
            ))
            .arg(&fixture.0)
            .arg(action)
            .status()
            .unwrap()
            .success()
    );
}
#[tokio::test]
async fn incompatible_schema_is_rejected_and_existing_wal_database_remains_readable() {
    let fixture = Fixture::v1();
    change_v1(&fixture, "incompatible");
    let before = std::fs::read(&fixture.0).unwrap();
    assert!(janus_v2::open_database(&fixture.0).await.is_err());
    assert_eq!(before, std::fs::read(&fixture.0).unwrap());
    let wal = Fixture::v1();
    change_v1(&wal, "wal");
    let database = janus_v2::open_database(&wal.0).await.unwrap();
    let app = janus_v2::database_router(database);
    assert_eq!(
        app.oneshot(
            Request::builder()
                .uri("/v2/watchlists/41")
                .body(Body::empty())
                .unwrap()
        )
        .await
        .unwrap()
        .status(),
        StatusCode::OK
    );
    // SQLite header byte 18 is the persisted write version: 2 means WAL.
    assert_eq!(std::fs::read(&wal.0).unwrap()[18], 2);
}
#[tokio::test]
async fn reads_refresh_after_v1_writes_without_restarting_or_changing_schema() {
    let fixture = Fixture::v1();
    let app = janus_v2::database_router(janus_v2::open_database(&fixture.0).await.unwrap());
    let read = || {
        Request::builder()
            .uri("/v2/watchlists/41")
            .body(Body::empty())
            .unwrap()
    };
    assert!(
        body(app.clone().oneshot(read()).await.unwrap())
            .await
            .contains("1 of 3 watched")
    );
    change_v1(&fixture, "mutate");
    assert!(
        body(app.clone().oneshot(read()).await.unwrap())
            .await
            .contains("2 of 3 watched")
    );
    change_v1(&fixture, "release");
    let released = body(app.oneshot(read()).await.unwrap()).await;
    assert!(
        released.find("data-item-id=\"101\"").unwrap()
            < released.find("data-item-id=\"102\"").unwrap()
    );
    assert!(released.contains("<h2>2020</h2>"));
    assert!(released.contains("<h2>TBA</h2>"));
}

#[tokio::test]
async fn exclusive_v1_lock_fails_within_the_configured_startup_bound() {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    let fixture = Fixture::v1();
    let mut writer=Command::new("python3").arg("-c").arg("import sqlite3,sys; connection=sqlite3.connect(sys.argv[1]); connection.execute('BEGIN EXCLUSIVE'); print('locked',flush=True); sys.stdin.read(); connection.rollback()").arg(&fixture.0).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    let mut ready = String::new();
    BufReader::new(writer.stdout.take().unwrap())
        .read_line(&mut ready)
        .unwrap();
    assert_eq!(ready.trim(), "locked");
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(7),
        janus_v2::open_database(&fixture.0),
    )
    .await;
    drop(writer.stdin.take());
    writer.wait().unwrap();
    assert!(
        result
            .expect("startup lock handling must be bounded")
            .is_err()
    );
}

#[tokio::test]
async fn feature_discovery_shares_order_search_selection_and_cursor_rules() {
    use janus_v2::{
        DiscoveryError, DiscoveryOperation as Operation, DiscoveryRequest as Request, Watchlists,
    };
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let page = lists
        .discovery(
            Operation::List,
            Request {
                page_size: Some(1),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(page["watchlists"][0]["id"], 42);
    let cursor = page["nextCursor"].as_str().unwrap().to_owned();
    let searched = lists
        .discovery(
            Operation::Search,
            Request {
                query: Some("CAFE\u{301}".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(searched["watchlists"][0]["id"], 41);
    assert!(matches!(
        lists
            .discovery(
                Operation::Search,
                Request {
                    query: Some("Café".into()),
                    cursor: Some(cursor),
                    ..Default::default()
                }
            )
            .await,
        Err(DiscoveryError::InvalidInput(_))
    ));
    let titles = lists
        .discovery(
            Operation::Get,
            Request {
                watchlist_id: Some(41),
                result_view: Some("titles".into()),
                page_size: Some(1),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(titles["titles"][0]["matchingItemCount"], 2);
    assert!(matches!(
        lists
            .discovery(
                Operation::Get,
                Request {
                    watchlist_id: Some(41),
                    page_size: Some(1),
                    cursor: Some(titles["nextCursor"].as_str().unwrap().into()),
                    ..Default::default()
                }
            )
            .await,
        Err(DiscoveryError::InvalidInput(_))
    ));
    let exact = lists
        .discovery(
            Operation::Find,
            Request {
                watchlist_id: Some(41),
                watchlist_item_id: Some(101),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(exact["items"][0]["id"], 101);
    assert!(matches!(
        lists
            .discovery(
                Operation::Find,
                Request {
                    watchlist_id: Some(999),
                    watchlist_item_id: Some(101),
                    page_size: Some(1),
                    ..Default::default()
                }
            )
            .await,
        Err(DiscoveryError::InvalidInput(_))
    ));
    assert!(matches!(
        lists
            .discovery(
                Operation::List,
                Request {
                    order: Some("sideways".into()),
                    ..Default::default()
                }
            )
            .await,
        Err(DiscoveryError::InvalidInput(_))
    ));
}

#[tokio::test]
async fn web_discovery_distinguishes_invalid_cursor_from_database_failure() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database.clone());
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists?cursor=invalid")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    database.close().await.unwrap();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert!(!body(response).await.contains("pool"));
}
