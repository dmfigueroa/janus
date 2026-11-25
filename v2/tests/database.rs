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
            "v1 fixture creation requires installed pnpm dependencies and the supported Node ABI"
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
    assert!(html.contains("https://image.tmdb.org/t/p/w200/poster.jpg"));
    assert!(html.contains("https://images.example/poster.jpg"));
    assert!(html.contains("class=\"timeline\""), "{html}");
    assert!(html.contains("<watchlist-reorder"), "{html}");
    assert!(!html.contains("data-mode=\"custom\""), "{html}");
    assert!(html.contains("id=\"reorder-recovery\""), "{html}");
    assert!(html.contains("closedby=\"any\""), "{html}");
    assert!(html.contains("id=\"watchlist-dialog-help\""), "{html}");
    assert!(
        html.contains("aria-describedby=\"watchlist-dialog-help\""),
        "{html}"
    );
    assert!(
        html.contains("data-watchlist-dialog-open=\"edit\""),
        "{html}"
    );
    assert!(html.contains("hx-post=\"/v2/watchlists/41\""), "{html}");
    assert!(
        html.contains("value=\"Café 東京 &#60;collection&#62;\""),
        "{html}"
    );
    assert!(
        html.contains("hx-post=\"/v2/watchlists/41/reorder?query=&amp;unwatched=true\""),
        "{html}"
    );
    assert!(html.contains("<details class=\"watched-run\">"), "{html}");
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
#[tokio::test]
async fn watchlist_home_renders_v1_cards_sections_and_local_navigation() {
    let fixture = Fixture::v1();
    let app = janus_v2::database_router(janus_v2::open_database(&fixture.0).await.unwrap());
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()["vary"],
        "HX-Request, HX-History-Restore-Request, Accept"
    );
    assert_eq!(response.headers()["cache-control"], "no-cache");
    let etag = response.headers()["etag"].to_str().unwrap().to_string();
    let html = body(response).await;
    assert!(
        html.contains("<h1 class=\"home-title\">My Lists</h1>"),
        "{html}"
    );
    assert!(html.contains("2 watchlists, 3 items"), "{html}");
    assert!(html.contains("class=\"watchlist-card\""), "{html}");
    assert!(html.contains("href=\"/v2/watchlists/41\""), "{html}");
    assert!(html.contains("href=\"/v2/watchlists/42\""), "{html}");
    assert!(html.contains("1 of 3 watched"), "{html}");
    assert!(html.contains("class=\"cover-placeholder\""), "{html}");
    assert!(
        html.contains("Next: E1 • Opening &#60;script&#62;"),
        "{html}"
    );
    assert!(html.contains("role=\"progressbar\""), "{html}");
    assert!(html.contains("aria-label=\"Primary navigation\""), "{html}");
    assert!(!html.contains("Completed (0)"), "{html}");
    assert!(
        html.contains("data-watchlist-dialog-open=\"create\""),
        "{html}"
    );
    assert!(html.contains("id=\"watchlist-dialog\""), "{html}");
    assert!(html.contains("hx-post=\"/v2/watchlists\""), "{html}");
    assert!(html.contains("Create New List"), "{html}");

    let not_modified = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists")
                .header("if-none-match", &etag)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(not_modified.status(), StatusCode::NOT_MODIFIED);

    let json_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists?query=caf%C3%A9")
                .header("accept", "application/json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(json_response.headers()["content-type"], "application/json");
    let json: serde_json::Value = serde_json::from_str(&body(json_response).await).unwrap();
    assert_eq!(json["query"], "café");
    assert_eq!(json["sections"][0]["cards"][0]["id"], 41);

    let detail = body(
        app.oneshot(
            Request::builder()
                .uri("/v2/watchlists/41")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap(),
    )
    .await;
    assert!(
        detail.contains("aria-label=\"Primary navigation\""),
        "{detail}"
    );
    assert!(detail.contains("href=\"/v2/watchlists\""), "{detail}");
}

#[tokio::test]
async fn watchlist_home_searches_and_pages_by_v1_recency() {
    let fixture = Fixture::v1();
    change_v1(&fixture, "many");
    let app = janus_v2::database_router(janus_v2::open_database(&fixture.0).await.unwrap());
    let search = |uri: &str, htmx: bool| {
        let mut request = Request::builder().uri(uri);
        if htmx {
            request = request.header("hx-request", "true");
        }
        app.clone().oneshot(request.body(Body::empty()).unwrap())
    };

    let response = search("/v2/watchlists?query=CAFE%CC%81", false)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let html = body(response).await;
    assert!(html.contains("Search results"), "{html}");
    assert!(html.contains("1 of 62 watchlists"), "{html}");
    assert!(html.contains("href=\"/v2/watchlists/41\""), "{html}");
    assert!(!html.contains("href=\"/v2/watchlists/42\""), "{html}");

    let fragment = body(search("/v2/watchlists?query=list", true).await.unwrap()).await;
    assert!(fragment.contains("id=\"watchlist-browse\""), "{fragment}");
    assert!(!fragment.contains("<html"), "{fragment}");
    assert!(fragment.contains("Bulk list 00"), "{fragment}");
    assert!(fragment.contains("Next page"), "{fragment}");

    let restored = body(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri("/v2/watchlists?query=list")
                    .header("hx-request", "true")
                    .header("hx-history-restore-request", "true")
                    .header("accept", "application/json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap(),
    )
    .await;
    assert!(restored.contains("<!doctype html>"), "{restored}");
    assert!(restored.contains("id=\"watchlist-search\""), "{restored}");
    assert!(
        restored.contains("aria-label=\"Primary navigation\""),
        "{restored}"
    );

    let empty = body(search("/v2/watchlists?query=missing", false).await.unwrap()).await;
    assert!(
        empty.contains("No watchlists match your search."),
        "{empty}"
    );
    assert!(empty.contains("Clear search"), "{empty}");
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
    assert_eq!(tools["tools"].as_array().unwrap().len(), 8);
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
    assert!(data["items"][0].get("authors").is_none());
    assert!(data["items"][0].get("posterPath").is_none());
    assert!(data["items"][0].get("releaseDate").is_none());
    assert!(
        data["watchlist"]["stats"]["nextUnwatched"]
            .get("posterPath")
            .is_some()
    );
    assert!(data["watchlist"]["stats"]["coverImage"].is_null());
    assert_eq!(data["watchlist"]["stats"]["coverMediaType"], "episode");
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
    let provider=result(rpc(&app,json!({"jsonrpc":"2.0","id":26,"method":"tools/call","params":{"name":"find_watchlist_items","arguments":{"watchlistId":41,"provider":"tmdb","providerId":"ep-1","mediaType":"episode"}}}),Some(&session)).await).await;
    assert_eq!(provider["structuredContent"]["items"][0]["id"], 101);
    assert!(provider["structuredContent"].get("watchlist").is_none());
    assert!(provider["structuredContent"].get("nextCursor").is_none());
    let missing=result(rpc(&app,json!({"jsonrpc":"2.0","id":27,"method":"tools/call","params":{"name":"find_watchlist_items","arguments":{"watchlistId":999,"watchlistItemId":101}}}),Some(&session)).await).await;
    assert_eq!(missing["structuredContent"]["items"], json!([]));
    assert!(missing.get("isError").is_none());
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

#[tokio::test]
async fn mcp_discovery_reports_database_failures_without_internal_details() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database.clone());
    let initialized = rpc(
        &app,
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"failure-test","version":"1"}}}),
        None,
    )
    .await;
    let session = initialized.headers()["mcp-session-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let _ = result(initialized).await;
    database.close().await.unwrap();
    for (id, name, arguments, message) in [
        (
            2,
            "list_watchlists",
            json!({}),
            "Unable to load watchlists.",
        ),
        (
            3,
            "search_watchlists",
            json!({"query":"cafe"}),
            "Unable to load watchlists.",
        ),
        (
            4,
            "get_watchlist",
            json!({"watchlistId":41}),
            "Unable to load watchlist.",
        ),
        (
            5,
            "find_watchlist_items",
            json!({"watchlistId":41,"query":"show"}),
            "Unable to load watchlist.",
        ),
    ] {
        let response = result(
            rpc(
                &app,
                json!({"jsonrpc":"2.0","id":id,"method":"tools/call","params":{"name":name,"arguments":arguments}}),
                Some(&session),
            )
            .await,
        )
        .await;
        assert_eq!(response["isError"], true, "{response}");
        assert_eq!(response["content"][0]["text"], message, "{response}");
    }
}

fn change_database(path: &std::path::Path, action: &str) {
    assert!(
        Command::new(std::env::var("JANUS_TEST_NODE").unwrap_or("node".into()))
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/create_v1_fixture.cjs"
            ))
            .arg(path)
            .arg(action)
            .status()
            .unwrap()
            .success()
    );
}
fn change_v1(fixture: &Fixture, action: &str) {
    change_database(&fixture.0, action);
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
            .contains("1/3 Watched")
    );
    change_v1(&fixture, "mutate");
    assert!(
        body(app.clone().oneshot(read()).await.unwrap())
            .await
            .contains("2/3 Watched")
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
        DiscoveryError, DiscoveryOperation as Operation, DiscoveryRequest as Request, ItemResults,
        Watchlists,
    };
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let page = lists
        .summaries(
            Operation::List,
            Request {
                page_size: Some(1),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(page.watchlists[0].watchlist.id, 42);
    let cursor = page.next_cursor.unwrap();
    let searched = lists
        .summaries(
            Operation::Search,
            Request {
                query: Some("CAFE\u{301}".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(searched.watchlists[0].watchlist.id, 41);
    assert!(matches!(
        lists
            .summaries(
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
        .items(
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
    let title_cursor = titles.next_cursor.clone().unwrap();
    let ItemResults::Titles(grouped) = &titles.results else {
        panic!("expected grouped titles");
    };
    assert_eq!(grouped[0].matching_item_count, 2);
    assert_eq!(grouped[0].provider_id, "show-1");
    assert!(matches!(
        lists
            .items(
                Operation::Get,
                Request {
                    watchlist_id: Some(41),
                    page_size: Some(1),
                    cursor: Some(title_cursor),
                    ..Default::default()
                }
            )
            .await,
        Err(DiscoveryError::InvalidInput(_))
    ));
    let exact = lists
        .items(
            Operation::Find,
            Request {
                watchlist_id: Some(41),
                watchlist_item_id: Some(101),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let ItemResults::Items(items) = &exact.results else {
        panic!("expected selected items");
    };
    assert_eq!(items[0].id, 101);
    assert!(exact.watchlist.is_none());
    assert!(exact.next_cursor.is_none());
    let provider = lists
        .items(
            Operation::Find,
            Request {
                watchlist_id: Some(41),
                provider: Some("tmdb".into()),
                provider_id: Some("ep-1".into()),
                media_type: Some("episode".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let ItemResults::Items(items) = &provider.results else {
        panic!("expected provider-selected items");
    };
    assert_eq!(
        items.iter().map(|item| item.id).collect::<Vec<_>>(),
        vec![101]
    );
    let missing = lists
        .items(
            Operation::Find,
            Request {
                watchlist_id: Some(999),
                watchlist_item_id: Some(101),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(missing.watchlist.is_none());
    assert!(matches!(&missing.results, ItemResults::Items(items) if items.is_empty()));
    assert!(matches!(
        lists
            .items(
                Operation::Find,
                Request {
                    watchlist_id: Some(999),
                    query: Some("show".into()),
                    ..Default::default()
                }
            )
            .await,
        Err(DiscoveryError::InvalidInput(_))
    ));
    assert!(matches!(
        lists
            .items(
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
            .summaries(
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
async fn discovery_cursors_keep_v1_binding_bytes_and_continue_old_pages() {
    use janus_v2::{
        DiscoveryOperation as Operation, DiscoveryRequest as Request, ItemResults, Watchlists,
    };
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let page = lists
        .summaries(
            Operation::List,
            Request {
                page_size: Some(1),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(
        page.next_cursor.as_deref(),
        Some("eyJvZmZzZXQiOjEsIm9yZGVyIjoiZGVzYyIsIm9yZGVyQnkiOiJjcmVhdGVkQXQifQ")
    );
    let items = lists
        .items(
            Operation::Get,
            Request {
                watchlist_id: Some(41),
                page_size: Some(1),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(
        items.next_cursor.as_deref(),
        Some("eyJvZmZzZXQiOjEsInBhZ2VTaXplIjoxLCJ3YXRjaGxpc3RJZCI6NDF9")
    );
    let continued = lists
        .items(
            Operation::Get,
            Request {
                watchlist_id: Some(41),
                page_size: Some(1),
                cursor: items.next_cursor,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let ItemResults::Items(items) = &continued.results else {
        panic!("expected continued items");
    };
    assert_eq!(
        items.iter().map(|item| item.id).collect::<Vec<_>>(),
        vec![101]
    );
}

#[tokio::test]
async fn typed_reads_decode_stored_values_and_preserve_order_token_semantics() {
    use janus_v2::{ItemOrderMode, Watchlists};
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let detail = lists.detail(41).await.unwrap().unwrap();
    let record = &detail.watchlist.watchlist;
    assert_eq!(record.name, "Café 東京 <collection>");
    assert_eq!(
        record.description.as_deref(),
        Some("Existing v1 collection")
    );
    assert_eq!(record.item_order_mode, ItemOrderMode::Custom);
    assert_eq!(record.created_at, "2020-01-01 12:30:00");
    assert_eq!(
        record.updated_at.as_deref(),
        Some("2020-01-01T12:30:00.000Z")
    );
    assert!(record.paused_at.is_none());
    assert_eq!(
        detail.items.iter().map(|item| item.id).collect::<Vec<_>>(),
        vec![102, 101, 103]
    );
    assert_eq!(detail.items[0].custom_rank, Some(1));
    assert_eq!(detail.items[1].custom_rank, Some(2));
    assert_eq!(detail.items[2].custom_rank, None);
    assert_eq!(detail.items[0].is_watched, Some(true));
    assert_eq!(detail.items[1].is_watched, None);
    assert_eq!(detail.items[1].parent_title.as_deref(), Some("A Show"));
    assert_eq!(detail.items[2].parent_title, None);
    assert_eq!(detail.items[2].authors, Some(Vec::new()));
    assert_eq!(
        detail.items[1].authors.as_deref(),
        Some(&["Écrivain".to_owned(), "著者".to_owned()][..])
    );
    let stats = &detail.watchlist.stats;
    assert_eq!(stats.total_items, 3);
    assert_eq!(stats.watched_items, 1);
    assert_eq!(stats.progress, 33);
    assert_eq!(stats.next_unwatched.as_ref().unwrap().id, 101);
    assert_eq!(
        stats.next_unwatched.as_ref().unwrap().authors.as_deref(),
        Some(&["Écrivain".to_owned(), "著者".to_owned()][..])
    );
    assert_eq!(stats.cover_image, None);
    assert_eq!(stats.cover_media_type.as_deref(), Some("episode"));
    assert_eq!(
        detail.order_token,
        "sha256:ce9b1d84c7ca0623380b8e2cb789f812334604e53245204fd25c9214d3fd1a7b"
    );
}

#[tokio::test]
async fn watched_watchlist_stats_fall_back_to_first_ordered_cover() {
    use janus_v2::Watchlists;
    let fixture = Fixture::v1();
    change_v1(&fixture, "watch-all");
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let stats = lists.detail(41).await.unwrap().unwrap().watchlist.stats;
    assert_eq!(stats.total_items, 3);
    assert_eq!(stats.watched_items, 3);
    assert_eq!(stats.progress, 100);
    assert!(stats.next_unwatched.is_none());
    assert_eq!(stats.cover_image.as_deref(), Some("/poster.jpg"));
    assert_eq!(stats.cover_media_type.as_deref(), Some("episode"));
}

#[tokio::test]
async fn empty_watchlist_stats_report_zero_progress_and_no_selection() {
    use janus_v2::Watchlists;
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let stats = lists.detail(42).await.unwrap().unwrap().watchlist.stats;
    assert_eq!(stats.total_items, 0);
    assert_eq!(stats.watched_items, 0);
    assert_eq!(stats.progress, 0);
    assert!(stats.next_unwatched.is_none());
    assert!(stats.cover_image.is_none());
    assert!(stats.cover_media_type.is_none());
}

#[tokio::test]
async fn all_summaries_matches_individual_reads_for_empty_partial_and_completed_lists() {
    use janus_v2::Watchlists;
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let summaries = lists.all_summaries().await.unwrap();
    let partial = summaries
        .iter()
        .find(|summary| summary.watchlist.id == 41)
        .unwrap();
    assert_eq!(partial.stats.total_items, 3);
    assert_eq!(partial.stats.watched_items, 1);
    assert_eq!(partial.stats.progress, 33);
    assert_eq!(partial.stats.next_unwatched.as_ref().unwrap().id, 101);
    assert!(partial.stats.cover_image.is_none());
    assert_eq!(partial.stats.cover_media_type.as_deref(), Some("episode"));
    let empty = summaries
        .iter()
        .find(|summary| summary.watchlist.id == 42)
        .unwrap();
    assert_eq!(empty.stats.total_items, 0);
    assert!(empty.stats.next_unwatched.is_none());

    change_v1(&fixture, "watch-all");
    let completed = lists
        .all_summaries()
        .await
        .unwrap()
        .into_iter()
        .find(|summary| summary.watchlist.id == 41)
        .unwrap();
    assert_eq!(completed.stats.progress, 100);
    assert!(completed.stats.next_unwatched.is_none());
    assert_eq!(completed.stats.cover_image.as_deref(), Some("/poster.jpg"));
}

const HOME_SUMMARY_STATEMENT_BUDGET: usize = 4;

struct StatementCounter(std::sync::Arc<AtomicUsize>);

impl StatementCounter {
    fn new() -> Self {
        Self(std::sync::Arc::new(AtomicUsize::new(0)))
    }

    fn install(&self, database: &mut sea_orm::DatabaseConnection) {
        let statements = std::sync::Arc::clone(&self.0);
        database.set_metric_callback(move |_| {
            statements.fetch_add(1, Ordering::Relaxed);
        });
    }

    fn count(&self) -> usize {
        self.0.load(Ordering::Relaxed)
    }
}

async fn counted_home_summaries(fixture: &Fixture) -> (usize, Vec<janus_v2::WatchlistSummary>) {
    let mut database = janus_v2::open_database(&fixture.0).await.unwrap();
    let counter = StatementCounter::new();
    counter.install(&mut database);
    let summaries = janus_v2::Watchlists(database)
        .all_summaries()
        .await
        .unwrap();
    (counter.count(), summaries)
}

#[tokio::test]
async fn home_summary_reads_use_a_fixed_statement_budget() {
    let fixture = Fixture::v1();
    let (two_watchlists, summaries) = counted_home_summaries(&fixture).await;
    let partial = summaries
        .iter()
        .find(|summary| summary.watchlist.id == 41)
        .unwrap();
    assert_eq!(partial.stats.total_items, 3);
    assert_eq!(partial.stats.watched_items, 1);
    assert_eq!(partial.stats.progress, 33);
    let empty = summaries
        .iter()
        .find(|summary| summary.watchlist.id == 42)
        .unwrap();
    assert_eq!(empty.stats.total_items, 0);
    assert!(
        two_watchlists <= HOME_SUMMARY_STATEMENT_BUDGET,
        "home summary read used {two_watchlists} statements for {} watchlists, budget is {HOME_SUMMARY_STATEMENT_BUDGET}",
        summaries.len()
    );

    change_v1(&fixture, "watch-all");
    let (completed_watchlists, completed) = counted_home_summaries(&fixture).await;
    let completed_list = completed
        .iter()
        .find(|summary| summary.watchlist.id == 41)
        .unwrap();
    assert_eq!(completed_list.stats.progress, 100);
    assert!(completed_list.stats.next_unwatched.is_none());
    assert_eq!(
        completed_watchlists, two_watchlists,
        "completing a watchlist must not change the statement count"
    );

    let bulk = Fixture::v1();
    change_v1(&bulk, "bulk");
    let (bulk_watchlists, bulk_summaries) = counted_home_summaries(&bulk).await;
    assert_eq!(bulk_summaries.len(), 32);
    assert!(
        bulk_summaries
            .iter()
            .any(|summary| summary.stats.total_items == 0)
    );
    assert!(bulk_summaries.iter().any(|summary| {
        summary.stats.total_items > summary.stats.watched_items && summary.stats.watched_items > 0
    }));
    assert!(bulk_summaries.iter().any(|summary| {
        summary.stats.total_items > 0 && summary.stats.total_items == summary.stats.watched_items
    }));
    assert_eq!(
        bulk_watchlists, two_watchlists,
        "the home summary read must not issue more statements as watchlists are added"
    );
    assert!(
        bulk_watchlists <= HOME_SUMMARY_STATEMENT_BUDGET,
        "home summary read used {bulk_watchlists} statements for {} watchlists, budget is {HOME_SUMMARY_STATEMENT_BUDGET}",
        bulk_summaries.len()
    );
}

#[tokio::test]
async fn summary_discovery_uses_efficient_counts_and_cover_fallback() {
    use janus_v2::{DiscoveryOperation as Operation, DiscoveryRequest as Request, Watchlists};
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let summary = |page: janus_v2::SummaryPage| {
        page.watchlists
            .into_iter()
            .find(|watchlist| watchlist.watchlist.id == 41)
            .unwrap()
    };
    let partial = summary(
        lists
            .summaries(Operation::List, Request::default())
            .await
            .unwrap(),
    );
    assert_eq!(partial.stats.total_items, 3);
    assert_eq!(partial.stats.watched_items, 1);
    assert_eq!(partial.stats.progress, 33);
    assert_eq!(partial.stats.next_unwatched.as_ref().unwrap().id, 101);
    assert!(partial.stats.cover_image.is_none());
    assert_eq!(partial.stats.cover_media_type.as_deref(), Some("episode"));

    change_v1(&fixture, "watch-all");
    let completed = summary(
        lists
            .summaries(Operation::List, Request::default())
            .await
            .unwrap(),
    );
    assert_eq!(completed.stats.progress, 100);
    assert!(completed.stats.next_unwatched.is_none());
    assert_eq!(completed.stats.cover_image.as_deref(), Some("/poster.jpg"));
    assert_eq!(completed.stats.cover_media_type.as_deref(), Some("episode"));
}

#[tokio::test]
async fn summary_discovery_hydrates_only_the_selected_page() {
    use janus_v2::{DiscoveryOperation as Operation, DiscoveryRequest as Request, Watchlists};
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let first = lists
        .summaries(
            Operation::List,
            Request {
                page_size: Some(1),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(first.watchlists.len(), 1);
    assert_eq!(first.watchlists[0].watchlist.id, 42);
    assert_eq!(first.watchlists[0].stats.total_items, 0);
    assert!(first.watchlists[0].stats.next_unwatched.is_none());

    let second = lists
        .summaries(
            Operation::List,
            Request {
                page_size: Some(1),
                cursor: first.next_cursor,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(second.watchlists.len(), 1);
    let partial = &second.watchlists[0];
    assert_eq!(partial.watchlist.id, 41);
    assert_eq!(partial.stats.total_items, 3);
    assert_eq!(partial.stats.watched_items, 1);
    assert_eq!(partial.stats.next_unwatched.as_ref().unwrap().id, 101);
    assert!(second.next_cursor.is_none());
}

#[tokio::test]
async fn summary_discovery_page_matches_all_summaries() {
    use janus_v2::{DiscoveryOperation as Operation, DiscoveryRequest as Request, Watchlists};
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let expected = lists.all_summaries().await.unwrap();
    let page = lists
        .summaries(Operation::List, Request::default())
        .await
        .unwrap();
    assert_eq!(page.watchlists.len(), expected.len());
    for summary in &page.watchlists {
        let matches = expected
            .iter()
            .find(|candidate| candidate.watchlist.id == summary.watchlist.id)
            .unwrap();
        assert_eq!(summary, matches);
    }
}

#[tokio::test]
async fn summary_discovery_stays_coherent_during_concurrent_writes() {
    use janus_v2::{DiscoveryOperation as Operation, DiscoveryRequest as Request, Watchlists};
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let path = fixture.0.clone();
    let writer = std::thread::spawn(move || {
        for action in ["watch-all", "mutate", "watch-all", "mutate"] {
            change_database(&path, action);
        }
    });
    for _ in 0..20 {
        let page = lists
            .summaries(Operation::List, Request::default())
            .await
            .unwrap();
        let partial = page
            .watchlists
            .iter()
            .find(|summary| summary.watchlist.id == 41)
            .unwrap();
        let stats = &partial.stats;
        assert_eq!(stats.total_items, 3);
        match stats.watched_items {
            3 => {
                assert_eq!(stats.progress, 100);
                assert!(stats.next_unwatched.is_none());
                assert_eq!(stats.cover_image.as_deref(), Some("/poster.jpg"));
            }
            1 | 2 => {
                assert_eq!(
                    stats.progress,
                    if stats.watched_items == 1 { 33 } else { 67 }
                );
                let next = stats.next_unwatched.as_ref().unwrap();
                assert_eq!(next.id, if stats.watched_items == 1 { 101 } else { 103 });
                assert_eq!(stats.cover_image, next.poster_path);
                assert_eq!(
                    stats.cover_media_type.as_deref(),
                    Some(next.media_type.as_str())
                );
            }
            watched => panic!("unexpected watched count: {watched}"),
        }
    }
    writer.join().unwrap();
}

#[tokio::test]
async fn item_discovery_returns_typed_order_and_full_next_unwatched() {
    use janus_v2::{
        DiscoveryOperation as Operation, DiscoveryRequest as Request, ItemResults, Watchlists,
    };
    let fixture = Fixture::v1();
    let lists = Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let read = lists
        .items(
            Operation::Get,
            Request {
                watchlist_id: Some(41),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let ItemResults::Items(items) = &read.results else {
        panic!("expected typed items");
    };
    assert_eq!(
        items.iter().map(|item| item.id).collect::<Vec<_>>(),
        vec![102, 101, 103]
    );
    let item = &items[1];
    assert_eq!(item.id, 101);
    assert_eq!(item.source, "tmdb");
    assert_eq!(item.tmdb_id, "ep-1");
    assert_eq!(item.parent_id.as_deref(), Some("show-1"));
    assert_eq!(item.parent_title.as_deref(), Some("A Show"));
    assert_eq!(item.is_watched, None);
    assert_eq!(
        item.authors.as_deref(),
        Some(&["Écrivain".to_owned(), "著者".to_owned()][..])
    );
    let next = &read.watchlist.as_ref().unwrap().stats.next_unwatched;
    let next = next.as_ref().unwrap();
    assert_eq!(next.id, 101);
    assert_eq!(next.poster_path, None);
    assert!(read.watchlist.as_ref().unwrap().stats.cover_image.is_none());
    assert_eq!(
        read.watchlist
            .as_ref()
            .unwrap()
            .stats
            .cover_media_type
            .as_deref(),
        Some("episode")
    );
    assert!(read.order_token.as_deref().unwrap().starts_with("sha256:"));
    assert!(read.next_cursor.is_none());
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

async fn ordered_item_ids(lists: &janus_v2::Watchlists, watchlist_id: i64) -> Vec<i64> {
    lists
        .detail(watchlist_id)
        .await
        .unwrap()
        .unwrap()
        .items
        .iter()
        .map(|item| item.id)
        .collect()
}

#[tokio::test]
async fn reorder_preserves_complete_order_and_rejects_invalid_anchors() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let lists = janus_v2::Watchlists(database.clone());
    let app = janus_v2::database_router(database.clone());
    for (reference, success) in [(103, true), (999, false)] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v2/watchlists/41/reorder")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"movedItemId":102,"referenceItemId":reference,"position":"after"})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let result: Value = serde_json::from_str(&body(response).await).unwrap();
        assert_eq!(result["success"], success);
        assert_eq!(ordered_item_ids(&lists, 41).await, vec![101, 103, 102]);
    }
}

#[tokio::test]
async fn reorder_renumbers_the_complete_order_when_v1_ranks_have_gaps() {
    let fixture = Fixture::v1();
    change_v1(&fixture, "gapped");
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let lists = janus_v2::Watchlists(database.clone());
    assert_eq!(ordered_item_ids(&lists, 43).await, vec![201, 202, 203, 204]);
    let app = janus_v2::database_router(database);
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/43/reorder")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"movedItemId":204,"referenceItemId":203,"position":"before"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&body(response).await).unwrap(),
        json!({"success":true})
    );
    change_v1(&fixture, "check-gapped-reorder");
    let reopened = janus_v2::Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    assert_eq!(
        ordered_item_ids(&reopened, 43).await,
        vec![201, 202, 204, 203]
    );
}

#[tokio::test]
async fn mcp_reorders_are_independent_and_visible_after_reopen() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database);
    let initialized = rpc(&app,json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"reorder-test","version":"1"}}}),None).await;
    let session = initialized.headers()["mcp-session-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let response = result(rpc(&app,json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"reorder_watchlist_items","arguments":{"reorders":[{"watchlistId":41,"movedItemId":102,"referenceItemId":999,"position":"after"},{"watchlistId":41,"movedItemId":102,"referenceItemId":103,"position":"after"}]}}}),Some(&session)).await).await;
    assert_eq!(
        response["structuredContent"]["results"][0]["code"],
        "invalid_reference"
    );
    assert_eq!(
        response["structuredContent"]["results"][1]["code"],
        "reordered"
    );
    let reopened = janus_v2::Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    assert_eq!(ordered_item_ids(&reopened, 41).await, vec![101, 103, 102]);
    change_v1(&fixture, "reject-rank");
    let failed = result(rpc(&app,json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"reorder_watchlist_items","arguments":{"reorders":[{"watchlistId":41,"movedItemId":101,"referenceItemId":102,"position":"after"},{}]}}}),Some(&session)).await).await;
    assert_eq!(
        failed["structuredContent"]["results"][0]["code"],
        "internal_error"
    );
    assert_eq!(
        failed["structuredContent"]["results"][0]["message"],
        "Unable to reorder watchlist items."
    );
    assert_eq!(
        failed["structuredContent"]["results"][1]["code"],
        "validation_error"
    );
    let malformed = rpc(&app,json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"reorder_watchlist_items","arguments":{"reorders":[{"watchlistId":41,"movedItemId":101,"referenceItemId":102,"position":"sideways"}]}}}),Some(&session)).await;
    let malformed: Value = serde_json::from_str(&body(malformed).await).unwrap();
    assert_eq!(malformed["error"]["code"], -32602);
}

#[tokio::test]
async fn failed_rank_write_rolls_back_and_v1_round_trips_successful_order() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database.clone());
    let request = || {
        Request::builder()
            .method("POST")
            .uri("/v2/watchlists/41/reorder")
            .header("content-type", "application/json")
            .body(Body::from(
                r#"{"movedItemId":102,"referenceItemId":103,"position":"after"}"#,
            ))
            .unwrap()
    };
    assert_eq!(
        serde_json::from_str::<Value>(&body(app.clone().oneshot(request()).await.unwrap()).await)
            .unwrap()["success"],
        true
    );
    change_v1(&fixture, "check-reorder");
    let lists = janus_v2::Watchlists(database);
    let before = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(before.items[0].id, 102);
    change_v1(&fixture, "reject-rank");
    assert_eq!(
        serde_json::from_str::<Value>(&body(app.oneshot(request()).await.unwrap()).await).unwrap()
            ["success"],
        false
    );
    assert_eq!(lists.detail(41).await.unwrap().unwrap(), before);
}

#[tokio::test]
async fn reorder_writer_contention_is_bounded_and_release_mode_rejects() {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let lists = janus_v2::Watchlists(database.clone());
    let before = lists.detail(41).await.unwrap().unwrap();
    let app = janus_v2::database_router(database);
    let request = || {
        Request::builder()
            .method("POST")
            .uri("/v2/watchlists/41/reorder")
            .header("content-type", "application/json")
            .body(Body::from(
                r#"{"movedItemId":102,"referenceItemId":103,"position":"after"}"#,
            ))
            .unwrap()
    };
    let mut writer=Command::new("python3").arg("-c").arg("import sqlite3,sys; connection=sqlite3.connect(sys.argv[1]); connection.execute('BEGIN IMMEDIATE'); print('locked',flush=True); sys.stdin.read(); connection.rollback()").arg(&fixture.0).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    let mut ready = String::new();
    BufReader::new(writer.stdout.take().unwrap())
        .read_line(&mut ready)
        .unwrap();
    assert_eq!(ready.trim(), "locked");
    let response = tokio::time::timeout(
        std::time::Duration::from_secs(7),
        app.clone().oneshot(request()),
    )
    .await;
    drop(writer.stdin.take());
    writer.wait().unwrap();
    let result: Value = serde_json::from_str(
        &body(response.expect("write contention must be bounded").unwrap()).await,
    )
    .unwrap();
    assert_eq!(result["code"], "internal_error");
    assert_eq!(lists.detail(41).await.unwrap().unwrap(), before);
    change_v1(&fixture, "release");
    let result: Value =
        serde_json::from_str(&body(app.oneshot(request()).await.unwrap()).await).unwrap();
    assert_eq!(result["code"], "not_custom_mode");
}

#[tokio::test]
async fn web_reorder_preserves_validation_and_domain_failure_contracts() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let lists = janus_v2::Watchlists(database.clone());
    let before = lists.detail(41).await.unwrap().unwrap();
    let app = janus_v2::database_router(database);
    for (moved, reference, position, code, message) in [
        (102, 103, "sideways", "validation_error", "Invalid position"),
        (
            102,
            102,
            "sideways",
            "invalid_reorder",
            "Moved item and reference item must differ",
        ),
        (
            102,
            102,
            "after",
            "invalid_reorder",
            "Moved item and reference item must differ",
        ),
        (
            999,
            103,
            "before",
            "invalid_item",
            "Moved item does not belong to this watchlist",
        ),
    ] {
        let response = app.clone().oneshot(Request::builder().method("POST")
            .uri("/v2/watchlists/41/reorder").header("content-type", "application/json")
            .body(Body::from(json!({"movedItemId":moved,"referenceItemId":reference,"position":position}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            serde_json::from_str::<Value>(&body(response).await).unwrap(),
            json!({"success":false,"code":code,"message":message})
        );
    }
    assert_eq!(lists.detail(41).await.unwrap().unwrap(), before);
}

#[tokio::test]
async fn htmx_reorder_returns_html_with_authoritative_order_and_domain_errors() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database);
    for (reference, message) in [
        (103, "Order saved."),
        (999, "Reference item does not belong to this watchlist"),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v2/watchlists/41/reorder?unwatched=false")
                    .header("hx-request", "true")
                    .header("content-type", "application/x-www-form-urlencoded")
                    .body(Body::from(format!(
                        "movedItemId=102&referenceItemId={reference}&position=after"
                    )))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(
            response.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with("text/html")
        );
        let html = body(response).await;
        assert!(html.contains(message), "{html}");
        assert!(!html.contains("<!doctype"));
        assert!(
            html.find("data-item-id=\"103\"").unwrap() < html.find("data-item-id=\"102\"").unwrap()
        );
    }
}

#[tokio::test]
async fn json_input_can_request_filtered_html_with_accept_header() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database);
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/reorder?query=nonexistent-title")
                .header("accept", "text/html")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"movedItemId":102,"referenceItemId":103,"position":"after"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        response.headers()["content-type"]
            .to_str()
            .unwrap()
            .starts_with("text/html")
    );
    let html = body(response).await;
    assert!(html.contains("Order saved."));
    assert!(html.contains("?query=nonexistent-title&amp;unwatched=true"));
    assert!(html.contains("No items match these filters."));
    assert!(!html.contains("data-item-id="));
}

async fn schema_snapshot(database: &sea_orm::DatabaseConnection) -> Vec<String> {
    use sea_orm::{ConnectionTrait, DbBackend, Statement};
    database
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT type, name, tbl_name, sql FROM sqlite_master \
             WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
        ))
        .await
        .unwrap()
        .iter()
        .map(|row| {
            format!(
                "{}|{}|{}|{}",
                row.try_get::<String>("", "type").unwrap(),
                row.try_get::<String>("", "name").unwrap(),
                row.try_get::<String>("", "tbl_name").unwrap(),
                row.try_get::<Option<String>>("", "sql")
                    .unwrap()
                    .unwrap_or_default()
            )
        })
        .collect()
}

#[tokio::test]
async fn web_create_preserves_validation_defaults_timestamps_and_v1_compatibility() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let schema = schema_snapshot(&database).await;
    let lists = janus_v2::Watchlists(database.clone());
    let app = janus_v2::database_router(database);

    let invalid = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists")
                .header("content-type", "application/json")
                .body(Body::from(json!({"name":"   "}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        serde_json::from_str::<Value>(&body(invalid).await).unwrap(),
        json!({"success":false,"code":"validation_error","message":"Name is required"})
    );

    let null_description = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"name":"From v2","description":null}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(null_description.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        serde_json::from_str::<Value>(&body(null_description).await).unwrap(),
        json!({"success":false,"code":"validation_error","message":"Invalid description."})
    );

    let created = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"name":"From v2","description":""}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(created.status(), StatusCode::OK);
    let created: Value = serde_json::from_str(&body(created).await).unwrap();
    assert_eq!(created["success"], true);
    assert_eq!(created["code"], "created");
    assert_eq!(created["message"], "Watchlist created.");
    assert_eq!(created["watchlist"]["name"], "From v2");
    assert_eq!(created["watchlist"]["description"], "");
    assert_eq!(created["watchlist"]["itemOrderMode"], "release");
    let id = created["watchlist"]["id"].as_i64().unwrap();

    let detail = lists.detail(id).await.unwrap().unwrap();
    let record = &detail.watchlist.watchlist;
    assert_eq!(record.created_at.len(), 19, "{}", record.created_at);
    assert_eq!(record.created_at[4..5], *"-");
    assert!(record.updated_at.is_none());
    assert!(record.paused_at.is_none());
    let rotation = record.last_watched_at.as_deref().unwrap();
    assert_eq!(rotation.len(), 23, "{rotation}");
    assert_eq!(record.item_order_mode, janus_v2::ItemOrderMode::Release);

    let htmx = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from(
                    "name=HTMX+created&description=&itemOrderMode=custom",
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(htmx.status(), StatusCode::NO_CONTENT);
    assert!(
        htmx.headers()["hx-trigger"]
            .to_str()
            .unwrap()
            .contains("watchlist-saved")
    );
    assert_eq!(body(htmx).await, "");

    let invalid_html = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from("name=+&description=Kept&itemOrderMode=custom"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_html.status(), StatusCode::OK);
    let html = body(invalid_html).await;
    assert!(html.contains("Name is required"), "{html}");
    assert!(html.contains("Kept</textarea"), "{html}");
    assert!(!html.contains("<dialog"), "{html}");

    assert_eq!(schema, schema_snapshot(&lists.0).await);
    change_v1(&fixture, "check-web-created");
}

#[tokio::test]
async fn web_update_changes_only_submitted_fields_and_reports_stale_targets() {
    let fixture = Fixture::v1();
    let lists = janus_v2::Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let before = lists.detail(41).await.unwrap().unwrap().watchlist.watchlist;
    let app = janus_v2::database_router(lists.0.clone());

    let updated = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"name":"Renamed v2","description":"","itemOrderMode":"release"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(updated.status(), StatusCode::OK);
    assert_eq!(
        serde_json::from_str::<Value>(&body(updated).await).unwrap(),
        json!({"success":true,"code":"updated","message":"Watchlist updated.","watchlistId":41})
    );
    let after = lists.detail(41).await.unwrap().unwrap().watchlist.watchlist;
    assert_eq!(after.name, "Renamed v2");
    assert_eq!(after.description, None);
    assert_eq!(after.item_order_mode, janus_v2::ItemOrderMode::Release);
    assert_eq!(after.created_at, before.created_at);
    let updated_at = after.updated_at.as_deref().unwrap();
    assert_ne!(Some(updated_at), before.updated_at.as_deref());
    assert_eq!(updated_at.len(), 19, "{updated_at}");
    assert_eq!(after.last_watched_at, before.last_watched_at);
    assert_eq!(after.paused_at, before.paused_at);

    let missing = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/99999")
                .header("content-type", "application/json")
                .body(Body::from(json!({"name":"Missing"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        serde_json::from_str::<Value>(&body(missing).await).unwrap(),
        json!({"success":false,"code":"not_found","message":"Watchlist not found.","watchlistId":99999})
    );

    let empty = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from(
                    "name=Renamed+v2&description=&itemOrderMode=custom",
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(empty.status(), StatusCode::NO_CONTENT);
    assert!(
        empty.headers()["hx-trigger"]
            .to_str()
            .unwrap()
            .contains("Changes saved successfully")
    );

    let validation = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from(
                    "name=&description=Still+here&itemOrderMode=custom",
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(validation.status(), StatusCode::OK);
    let html = body(validation).await;
    assert!(html.contains("Name is required"), "{html}");
    assert!(html.contains("Still here"), "{html}");
    assert!(html.contains("id=\"watchlist-form\""), "{html}");
    assert!(
        html.contains("aria-describedby=\"watchlist-form-error\""),
        "{html}"
    );
}

#[tokio::test]
async fn switching_to_custom_order_initializes_release_ranks_and_round_trips() {
    let fixture = Fixture::v1();
    let status = Command::new(std::env::var("JANUS_TEST_NODE").unwrap_or("node".into()))
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/create_v1_fixture.cjs"
        ))
        .arg(&fixture.0)
        .arg("release-no-ranks")
        .status()
        .unwrap();
    assert!(status.success());
    let lists = janus_v2::Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let app = janus_v2::database_router(lists.0.clone());
    let before = lists.detail(41).await.unwrap().unwrap();
    let release_ids = before.items.iter().map(|item| item.id).collect::<Vec<_>>();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(json!({"itemOrderMode":"custom"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let custom = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        custom.watchlist.watchlist.item_order_mode,
        janus_v2::ItemOrderMode::Custom
    );
    assert_eq!(
        custom.items.iter().map(|item| item.id).collect::<Vec<_>>(),
        release_ids
    );
    assert!(
        custom
            .items
            .iter()
            .enumerate()
            .all(|(index, item)| item.custom_rank == Some((index + 1) as i64))
    );

    let reordered = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/reorder")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "movedItemId": release_ids[2],
                        "referenceItemId": release_ids[0],
                        "position": "before"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reordered.status(), StatusCode::OK);
    let manually_ordered = lists.detail(41).await.unwrap().unwrap();
    let manual_ids = manually_ordered
        .items
        .iter()
        .map(|item| item.id)
        .collect::<Vec<_>>();
    assert_eq!(
        manual_ids,
        vec![release_ids[2], release_ids[0], release_ids[1]]
    );
    let manual_ranks = manually_ordered
        .items
        .iter()
        .map(|item| item.custom_rank)
        .collect::<Vec<_>>();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(json!({"itemOrderMode":"release"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let release = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        release.watchlist.watchlist.item_order_mode,
        janus_v2::ItemOrderMode::Release
    );
    assert_eq!(
        release.items.iter().map(|item| item.id).collect::<Vec<_>>(),
        release_ids
    );

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(json!({"itemOrderMode":"custom"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let round_trip = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        round_trip
            .items
            .iter()
            .map(|item| item.id)
            .collect::<Vec<_>>(),
        manual_ids
    );
    assert_eq!(
        round_trip
            .items
            .iter()
            .map(|item| item.custom_rank)
            .collect::<Vec<_>>(),
        manual_ranks
    );
}

#[tokio::test]
async fn mcp_create_and_update_keep_ordered_independent_batch_outcomes() {
    let fixture = Fixture::v1();
    let lists = janus_v2::Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let app = janus_v2::database_router(lists.0.clone());
    let initialized = rpc(
        &app,
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"write-test","version":"1"}}}),
        None,
    )
    .await;
    let session = initialized.headers()["mcp-session-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let _ = result(initialized).await;
    let tools = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
            Some(&session),
        )
        .await,
    )
    .await;
    let tools = tools["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 8);
    let create = tools
        .iter()
        .find(|tool| tool["name"] == "create_watchlists")
        .unwrap();
    assert_eq!(create["annotations"]["readOnlyHint"], false);
    assert_eq!(create["annotations"]["destructiveHint"], false);
    assert_eq!(
        create["inputSchema"]["properties"]["watchlists"]["minItems"],
        1
    );
    assert_eq!(
        create["outputSchema"]["properties"]["results"]["items"]["required"],
        json!(["index", "success", "code", "message"])
    );
    let update = tools
        .iter()
        .find(|tool| tool["name"] == "update_watchlists")
        .unwrap();
    assert_eq!(update["annotations"]["readOnlyHint"], false);
    assert_eq!(update["annotations"]["destructiveHint"], false);

    let created = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_watchlists","arguments":{"watchlists":[
                {"name":"MCP created","description":"Created through MCP","itemOrderMode":"custom"},
                {"description":"Name is missing"},
                {"name":""}
            ]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    let results = created["structuredContent"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 3);
    assert_eq!(results[0]["index"], 0);
    assert_eq!(results[0]["success"], true);
    assert_eq!(results[0]["code"], "created");
    assert_eq!(results[0]["message"], "Watchlist created.");
    assert_eq!(results[0]["watchlist"]["name"], "MCP created");
    assert_eq!(
        results[0]["watchlist"]["description"],
        "Created through MCP"
    );
    assert_eq!(results[0]["watchlist"]["itemOrderMode"], "custom");
    assert_eq!(results[1]["index"], 1);
    assert_eq!(results[1]["success"], false);
    assert_eq!(results[1]["code"], "validation_error");
    assert_eq!(results[1]["message"], "Name is required");
    assert_eq!(results[2]["message"], "Name is required");
    let created_id = results[0]["watchlist"]["id"].as_i64().unwrap();

    let updated = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"update_watchlists","arguments":{"watchlists":[
                {"watchlistId":created_id,"description":null,"itemOrderMode":"release"},
                {"watchlistId":999999,"name":"Missing"},
                {"watchlistId":created_id}
            ]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    let results = updated["structuredContent"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 3);
    assert_eq!(results[0]["index"], 0);
    assert_eq!(results[0]["success"], true);
    assert_eq!(results[0]["code"], "updated");
    assert_eq!(results[0]["message"], "Watchlist updated.");
    assert_eq!(results[0]["watchlistId"], created_id);
    assert_eq!(results[1]["index"], 1);
    assert_eq!(results[1]["success"], false);
    assert_eq!(results[1]["code"], "not_found");
    assert_eq!(results[1]["message"], "Watchlist not found.");
    assert_eq!(results[1]["watchlistId"], 999999);
    assert_eq!(results[2]["success"], false);
    assert_eq!(results[2]["code"], "validation_error");
    assert_eq!(results[2]["message"], "No fields to update.");
    assert_eq!(results[2]["watchlistId"], created_id);

    let detail = lists.detail(created_id).await.unwrap().unwrap();
    assert_eq!(detail.watchlist.watchlist.description, None);
    assert_eq!(
        detail.watchlist.watchlist.item_order_mode,
        janus_v2::ItemOrderMode::Release
    );
    assert!(detail.watchlist.watchlist.updated_at.is_some());
    change_v1(&fixture, "check-mcp-created");
}

#[tokio::test]
async fn mcp_update_watchlists_preserves_custom_ranks_across_order_modes() {
    let fixture = Fixture::v1();
    let status = Command::new(std::env::var("JANUS_TEST_NODE").unwrap_or("node".into()))
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/create_v1_fixture.cjs"
        ))
        .arg(&fixture.0)
        .arg("release")
        .status()
        .unwrap();
    assert!(status.success());
    let lists = janus_v2::Watchlists(janus_v2::open_database(&fixture.0).await.unwrap());
    let release_items = lists
        .detail(41)
        .await
        .unwrap()
        .unwrap()
        .items
        .iter()
        .map(|item| (item.id, item.custom_rank))
        .collect::<Vec<_>>();
    assert_eq!(
        release_items,
        vec![(101, Some(2)), (102, Some(1)), (103, None)]
    );
    let app = janus_v2::database_router(lists.0.clone());
    let initialized = rpc(
        &app,
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"order-mode-test","version":"1"}}}),
        None,
    )
    .await;
    let session = initialized.headers()["mcp-session-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let _ = result(initialized).await;

    let response = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"update_watchlists","arguments":{"watchlists":[{"watchlistId":41,"itemOrderMode":"custom"}]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(response["structuredContent"]["results"][0]["success"], true);

    let custom = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        custom
            .items
            .iter()
            .map(|item| (item.id, item.custom_rank))
            .collect::<Vec<_>>(),
        vec![(102, Some(1)), (101, Some(2)), (103, None)]
    );

    let response = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"update_watchlists","arguments":{"watchlists":[{"watchlistId":41,"itemOrderMode":"release"}]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(response["structuredContent"]["results"][0]["success"], true);
    let response = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"update_watchlists","arguments":{"watchlists":[{"watchlistId":41,"itemOrderMode":"custom"}]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(response["structuredContent"]["results"][0]["success"], true);
    let round_trip = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        round_trip
            .items
            .iter()
            .map(|item| (item.id, item.custom_rank))
            .collect::<Vec<_>>(),
        vec![(102, Some(1)), (101, Some(2)), (103, None)]
    );
}

#[tokio::test]
async fn order_mode_transitions_preserve_tie_breaks_mixed_ranks_rollback_and_v1_reads() {
    let fixture = Fixture::v1();
    change_v1(&fixture, "release-tie-breaks");
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let schema_before = schema_snapshot(&database).await;
    let lists = janus_v2::Watchlists(database.clone());
    let app = janus_v2::database_router(database.clone());

    let initial = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        initial.watchlist.watchlist.item_order_mode,
        janus_v2::ItemOrderMode::Release
    );
    assert_eq!(
        initial.items.iter().map(|item| item.id).collect::<Vec<_>>(),
        vec![101, 104, 102, 106, 103, 105]
    );

    let to_custom = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(json!({"itemOrderMode":"custom"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(to_custom.status(), StatusCode::OK);

    let custom = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        custom
            .items
            .iter()
            .map(|item| (item.id, item.custom_rank))
            .collect::<Vec<_>>(),
        vec![
            (101, Some(1)),
            (104, Some(2)),
            (102, Some(3)),
            (106, Some(4)),
            (103, Some(5)),
            (105, Some(6)),
        ]
    );

    let reorder = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/reorder")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"movedItemId":105,"referenceItemId":101,"position":"before"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reorder.status(), StatusCode::OK);

    let to_release = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(json!({"itemOrderMode":"release"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(to_release.status(), StatusCode::OK);

    change_v1(&fixture, "add-unranked-in-release");
    let release_with_new = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        release_with_new
            .items
            .iter()
            .map(|item| item.id)
            .collect::<Vec<_>>(),
        vec![107, 101, 104, 102, 106, 103, 105]
    );

    let back_to_custom = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(json!({"itemOrderMode":"custom"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(back_to_custom.status(), StatusCode::OK);

    let mixed_custom = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        mixed_custom
            .items
            .iter()
            .map(|item| (item.id, item.custom_rank))
            .collect::<Vec<_>>(),
        vec![
            (105, Some(1)),
            (101, Some(2)),
            (104, Some(3)),
            (102, Some(4)),
            (106, Some(5)),
            (103, Some(6)),
            (107, None),
        ]
    );
    assert_eq!(schema_before, schema_snapshot(&database).await);
    change_v1(&fixture, "check-order-mode-v1-read");

    let rollback_fixture = Fixture::v1();
    change_v1(&rollback_fixture, "release-no-ranks");
    change_v1(&rollback_fixture, "reject-rank");
    let rollback_database = janus_v2::open_database(&rollback_fixture.0).await.unwrap();
    let rollback_lists = janus_v2::Watchlists(rollback_database.clone());
    let rollback_app = janus_v2::database_router(rollback_database);
    let before_rollback = rollback_lists.detail(41).await.unwrap().unwrap();

    let failed_switch = rollback_app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(json!({"itemOrderMode":"custom"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(failed_switch.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(
        serde_json::from_str::<Value>(&body(failed_switch).await).unwrap()["code"],
        "internal_error"
    );
    assert_eq!(
        rollback_lists.detail(41).await.unwrap().unwrap(),
        before_rollback
    );
}

#[tokio::test]
async fn web_order_mode_changes_reconcile_filters_grouping_reorder_and_validation() {
    let fixture = Fixture::v1();
    change_v1(&fixture, "release-tie-breaks");
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database);

    let invalid_json = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"itemOrderMode":"alphabetical"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_json.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        serde_json::from_str::<Value>(&body(invalid_json).await).unwrap(),
        json!({
            "success": false,
            "code": "validation_error",
            "message": "Invalid order mode.",
            "watchlistId": 41
        })
    );

    let invalid_htmx = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from("name=Keep+Name&itemOrderMode=alphabetical"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_htmx.status(), StatusCode::OK);
    let invalid_html = body(invalid_htmx).await;
    assert!(
        invalid_html.contains("Invalid order mode."),
        "{invalid_html}"
    );
    assert!(
        !invalid_html.contains("aria-invalid=\"true\""),
        "{invalid_html}"
    );

    let release_page = body(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri("/v2/watchlists/41?query=A%20Show&unwatched=true")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap(),
    )
    .await;
    assert!(release_page.contains("hx-select-oob=\"#watchlist-form\""));
    assert!(release_page.contains("value=\"A Show\""));
    assert!(release_page.contains("<h2>2020</h2>"));
    assert!(release_page.contains("<h2>2021</h2>"));
    assert_eq!(
        release_page
            .matches("<details class=\"watched-run\">")
            .count(),
        2
    );
    assert!(release_page.contains("<div class=\"timeline\">"));
    assert!(!release_page.contains("<watchlist-reorder"));
    assert!(!release_page.contains("reorder-handle"));

    let blocked_reorder = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/reorder")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"movedItemId":104,"referenceItemId":101,"position":"before"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&body(blocked_reorder).await).unwrap()["code"],
        "not_custom_mode"
    );

    let to_custom = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from("name=Caf%C3%A9&itemOrderMode=custom"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(to_custom.status(), StatusCode::NO_CONTENT);

    let custom_page = body(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri("/v2/watchlists/41?query=A%20Show&unwatched=true")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap(),
    )
    .await;
    assert!(custom_page.contains("value=\"A Show\""));
    assert!(!custom_page.contains("<h2>2020</h2>"));
    assert!(!custom_page.contains("<h2>2021</h2>"));
    assert_eq!(
        custom_page
            .matches("<details class=\"watched-run\">")
            .count(),
        1
    );
    assert!(custom_page.contains("2 watched items"));
    assert!(custom_page.contains("<watchlist-reorder"));
    assert!(custom_page.contains("reorder-handle"));
    assert!(custom_page.contains("value=\"custom\""));
    assert!(
        custom_page.find("data-item-id=\"101\"").unwrap()
            < custom_page.find("data-item-id=\"104\"").unwrap()
    );

    let reorder = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/reorder")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"movedItemId":104,"referenceItemId":101,"position":"before"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&body(reorder).await).unwrap()["success"],
        true
    );

    let reordered_page = body(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri("/v2/watchlists/41?query=A%20Show&unwatched=false")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap(),
    )
    .await;
    assert!(
        reordered_page.find("data-item-id=\"104\"").unwrap()
            < reordered_page.find("data-item-id=\"101\"").unwrap()
    );
    assert!(!reordered_page.contains("<details class=\"watched-run\">"));

    let back_to_release = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41")
                .header("content-type", "application/json")
                .body(Body::from(json!({"itemOrderMode":"release"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(back_to_release.status(), StatusCode::OK);

    let restored_release_page = body(
        app.oneshot(
            Request::builder()
                .uri("/v2/watchlists/41?query=A%20Show&unwatched=false")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap(),
    )
    .await;
    assert!(restored_release_page.contains("<h2>2020</h2>"));
    assert!(restored_release_page.contains("<div class=\"timeline\">"));
    assert!(!restored_release_page.contains("<watchlist-reorder"));
    assert!(
        restored_release_page.find("data-item-id=\"101\"").unwrap()
            < restored_release_page.find("data-item-id=\"104\"").unwrap()
    );
}

#[tokio::test]
async fn mcp_order_mode_contracts_validate_inputs_preserve_batches_and_sync_reads() {
    let fixture = Fixture::v1();
    change_v1(&fixture, "release-tie-breaks");
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let app = janus_v2::database_router(database);
    let initialized = rpc(
        &app,
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"order-mode-contract","version":"1"}}}),
        None,
    )
    .await;
    let session = initialized.headers()["mcp-session-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let _ = result(initialized).await;

    for invalid_mode in [json!("sideways"), Value::Null] {
        let malformed = rpc(
            &app,
            json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"update_watchlists","arguments":{"watchlists":[{"watchlistId":41,"itemOrderMode":invalid_mode}]}}}),
            Some(&session),
        )
        .await;
        let payload: Value = serde_json::from_str(&body(malformed).await).unwrap();
        assert_eq!(payload["error"]["code"], -32602, "{payload}");
    }

    let before_get = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    let release_token = before_get["structuredContent"]["orderToken"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        before_get["structuredContent"]["watchlist"]["itemOrderMode"],
        "release"
    );

    let batch = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"update_watchlists","arguments":{"watchlists":[
                {"watchlistId":41,"itemOrderMode":"custom"},
                {"watchlistId":999999,"itemOrderMode":"custom"},
                {"watchlistId":41}
            ]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    let results = batch["structuredContent"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 3);
    assert_eq!(results[0]["code"], "updated");
    assert_eq!(results[1]["code"], "not_found");
    assert_eq!(results[1]["watchlistId"], 999999);
    assert_eq!(results[2]["code"], "validation_error");
    assert_eq!(results[2]["message"], "No fields to update.");

    let after_custom_get = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(
        after_custom_get["structuredContent"]["watchlist"]["itemOrderMode"],
        "custom"
    );
    assert_ne!(
        after_custom_get["structuredContent"]["orderToken"]
            .as_str()
            .unwrap(),
        release_token
    );

    let reorder_in_custom = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"reorder_watchlist_items","arguments":{"reorders":[{"watchlistId":41,"movedItemId":105,"referenceItemId":101,"position":"before"}]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(
        reorder_in_custom["structuredContent"]["results"][0]["code"],
        "reordered"
    );

    let custom_after_reorder = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(
        custom_after_reorder["structuredContent"]["watchlist"]["stats"]["nextUnwatched"]["id"],
        105
    );

    let switch_release = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"update_watchlists","arguments":{"watchlists":[{"watchlistId":41,"itemOrderMode":"release"}]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(
        switch_release["structuredContent"]["results"][0]["code"],
        "updated"
    );

    let after_release_get = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_watchlist","arguments":{"watchlistId":41}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(
        after_release_get["structuredContent"]["watchlist"]["stats"]["nextUnwatched"]["id"],
        101
    );
    assert_eq!(
        after_release_get["structuredContent"]["orderToken"]
            .as_str()
            .unwrap(),
        release_token
    );

    let reorder_in_release = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"reorder_watchlist_items","arguments":{"reorders":[{"watchlistId":41,"movedItemId":105,"referenceItemId":101,"position":"before"}]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert_eq!(
        reorder_in_release["structuredContent"]["results"][0]["code"],
        "not_custom_mode"
    );
}

#[tokio::test]
async fn web_edit_item_negotiates_htmx_html_json_validates_and_preserves_unmodified_columns() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let schema_before = schema_snapshot(&database).await;
    let lists = janus_v2::Watchlists(database.clone());
    let app = janus_v2::database_router(database.clone());

    let before_detail = lists.detail(41).await.unwrap().unwrap();
    let before_item_101 = before_detail
        .items
        .iter()
        .find(|item| item.id == 101)
        .unwrap()
        .clone();

    let edit_form = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists/41/items/102/edit")
                .header("hx-request", "true")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(edit_form.status(), StatusCode::OK);
    assert_eq!(edit_form.headers()["vary"], "HX-Request, Accept");
    let form_html = body(edit_form).await;
    assert!(form_html.contains("id=\"item-edit-form\""), "{form_html}");
    assert!(form_html.contains("value=\"Second\""), "{form_html}");
    assert!(form_html.contains("value=\"2020-02-02\""), "{form_html}");
    assert!(form_html.contains("value=\"/poster.jpg\""), "{form_html}");
    assert!(
        form_html.contains("src=\"https://image.tmdb.org/t/p/w500/poster.jpg\""),
        "{form_html}"
    );
    assert!(
        form_html.contains("referrerpolicy=\"no-referrer\""),
        "{form_html}"
    );

    let edit_form_json = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists/41/items/102/edit")
                .header("accept", "application/json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(edit_form_json.status(), StatusCode::OK);
    assert_eq!(edit_form_json.headers()["vary"], "HX-Request, Accept");
    assert_eq!(
        serde_json::from_str::<Value>(&body(edit_form_json).await).unwrap(),
        json!({
            "watchlistId": 41,
            "watchlistItemId": 102,
            "title": "Second",
            "releaseDate": "2020-02-02",
            "posterPath": "/poster.jpg"
        })
    );

    let missing_form = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v2/watchlists/42/items/101/edit")
                .header("accept", "application/json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(missing_form.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        serde_json::from_str::<Value>(&body(missing_form).await).unwrap()["code"],
        "not_found"
    );

    let invalid_htmx = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/items/101")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from(
                    "title=Draft+Title&releaseDate=2025-02-29&posterPath=http%3A%2F%2Finvalid.example%2Fp.jpg",
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_htmx.status(), StatusCode::OK);
    assert_eq!(invalid_htmx.headers()["vary"], "HX-Request, Accept");
    let invalid_html = body(invalid_htmx).await;
    assert!(
        invalid_html.contains("Release date must be a valid calendar date."),
        "{invalid_html}"
    );
    assert!(
        invalid_html.contains("value=\"Draft Title\""),
        "{invalid_html}"
    );
    assert!(
        invalid_html.contains("value=\"2025-02-29\""),
        "{invalid_html}"
    );
    assert!(
        invalid_html.contains("value=\"http://invalid.example/p.jpg\""),
        "{invalid_html}"
    );
    assert!(
        !invalid_html.contains("src=\"http://invalid.example/p.jpg\""),
        "{invalid_html}"
    );

    let invalid_json_empty_string = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/items/101")
                .header("content-type", "application/json")
                .body(Body::from(json!({"releaseDate": ""}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_json_empty_string.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        invalid_json_empty_string.headers()["vary"],
        "HX-Request, Accept"
    );
    assert_eq!(
        serde_json::from_str::<Value>(&body(invalid_json_empty_string).await).unwrap()["code"],
        "validation_error"
    );

    let htmx_saved = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/items/101")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from(
                    "title=++Trimmed+From+V2++&releaseDate=2025&posterPath=https%3A%2F%2Fimages.example.com%2Fv2-edited.jpg",
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(htmx_saved.status(), StatusCode::NO_CONTENT);
    assert_eq!(htmx_saved.headers()["vary"], "HX-Request, Accept");
    let trigger: Value =
        serde_json::from_str(htmx_saved.headers()["hx-trigger"].to_str().unwrap()).unwrap();
    assert_eq!(trigger["watchlist-item-saved"]["watchlistId"], 41);
    assert_eq!(trigger["watchlist-item-saved"]["watchlistItemId"], 101);

    let prg_clear = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/items/102")
                .header("accept", "text/html")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from("title=Second&releaseDate=&posterPath="))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(prg_clear.status(), StatusCode::SEE_OTHER);
    assert_eq!(prg_clear.headers()["location"], "/v2/watchlists/41");
    assert_eq!(prg_clear.headers()["vary"], "HX-Request, Accept");

    let json_partial = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/items/103")
                .header("content-type", "application/json")
                .body(Body::from(json!({"title": "  Renamed Book  "}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(json_partial.status(), StatusCode::OK);
    assert_eq!(json_partial.headers()["vary"], "HX-Request, Accept");
    assert_eq!(
        serde_json::from_str::<Value>(&body(json_partial).await).unwrap(),
        json!({
            "success": true,
            "code": "edited",
            "message": "Watchlist item edited.",
            "watchlistId": 41,
            "watchlistItemId": 103
        })
    );

    let after_detail = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        after_detail.watchlist.watchlist.updated_at,
        before_detail.watchlist.watchlist.updated_at
    );
    assert_eq!(
        after_detail.watchlist.watchlist.last_watched_at,
        before_detail.watchlist.watchlist.last_watched_at
    );
    let after_item_101 = after_detail
        .items
        .iter()
        .find(|item| item.id == 101)
        .unwrap();
    assert_eq!(after_item_101.title, "Trimmed From V2");
    assert_eq!(after_item_101.release_date.as_deref(), Some("2025"));
    assert_eq!(
        after_item_101.poster_path.as_deref(),
        Some("https://images.example.com/v2-edited.jpg")
    );
    assert_eq!(after_item_101.tmdb_id, before_item_101.tmdb_id);
    assert_eq!(after_item_101.source, before_item_101.source);
    assert_eq!(after_item_101.media_type, before_item_101.media_type);
    assert_eq!(after_item_101.custom_rank, before_item_101.custom_rank);
    assert_eq!(after_item_101.is_watched, before_item_101.is_watched);
    assert_eq!(after_item_101.added_at, before_item_101.added_at);
    assert_eq!(
        after_detail
            .watchlist
            .stats
            .next_unwatched
            .as_ref()
            .unwrap()
            .title,
        "Trimmed From V2"
    );
    assert_eq!(
        after_detail.watchlist.stats.cover_image.as_deref(),
        Some("https://images.example.com/v2-edited.jpg")
    );
    let after_item_103 = after_detail
        .items
        .iter()
        .find(|item| item.id == 103)
        .unwrap();
    assert_eq!(after_item_103.title, "Renamed Book");
    assert_eq!(
        after_item_103.poster_path.as_deref(),
        Some("https://images.example/poster.jpg")
    );

    let summaries = lists.all_summaries().await.unwrap();
    let summary_41 = summaries
        .iter()
        .find(|summary| summary.watchlist.id == 41)
        .unwrap();
    assert_eq!(
        summary_41.stats.next_unwatched.as_ref().unwrap().title,
        "Trimmed From V2"
    );
    assert_eq!(
        summary_41.stats.cover_image.as_deref(),
        Some("https://images.example.com/v2-edited.jpg")
    );

    assert_eq!(schema_before, schema_snapshot(&database).await);
    change_v1(&fixture, "check-v2-edited-items");

    change_v1(&fixture, "reject-item-title");
    let db_error = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/items/101")
                .header("hx-request", "true")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from("title=Will+Abort&releaseDate=2026"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(db_error.status(), StatusCode::OK);
    let db_error_html = body(db_error).await;
    assert!(
        db_error_html.contains("Failed to save changes. Please try again."),
        "{db_error_html}"
    );
    assert!(
        db_error_html.contains("value=\"Will Abort\""),
        "{db_error_html}"
    );
    assert!(db_error_html.contains("value=\"2026\""), "{db_error_html}");
}

#[tokio::test]
async fn release_order_edit_updates_order_token_next_unwatched_cover_and_v1_round_trip() {
    let fixture = Fixture::v1();
    change_v1(&fixture, "release");
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let lists = janus_v2::Watchlists(database.clone());
    let app = janus_v2::database_router(database);

    let before = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        before.items.iter().map(|item| item.id).collect::<Vec<_>>(),
        vec![101, 102, 103]
    );
    assert_eq!(
        before.watchlist.stats.next_unwatched.as_ref().unwrap().id,
        101
    );
    let token_before = before.order_token.clone();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/watchlists/41/items/103")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "releaseDate": "2018-05-01",
                        "posterPath": "/earliest-cover.jpg"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let after = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(
        after.items.iter().map(|item| item.id).collect::<Vec<_>>(),
        vec![103, 101, 102]
    );
    assert_ne!(after.order_token, token_before);
    assert_eq!(
        after.watchlist.stats.next_unwatched.as_ref().unwrap().id,
        103
    );
    assert_eq!(
        after.watchlist.stats.cover_image.as_deref(),
        Some("/earliest-cover.jpg")
    );

    change_v1(&fixture, "v1-edit-item");
    let after_v1 = lists.detail(41).await.unwrap().unwrap();
    assert_eq!(after_v1.items[0].id, 103);
    assert_eq!(after_v1.items[0].title, "Edited From V1");
    assert_eq!(
        after_v1.items[0].release_date.as_deref(),
        Some("2019-06-15")
    );
    assert_eq!(
        after_v1.items[0].poster_path.as_deref(),
        Some("/from-v1.jpg")
    );
}

#[tokio::test]
async fn mcp_edit_watchlist_items_preserves_schema_annotations_rejection_and_batch_isolation() {
    let fixture = Fixture::v1();
    let database = janus_v2::open_database(&fixture.0).await.unwrap();
    let lists = janus_v2::Watchlists(database.clone());
    let app = janus_v2::database_router(database);

    let initialized = rpc(
        &app,
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"edit-item-mcp","version":"1"}}}),
        None,
    )
    .await;
    let session = initialized.headers()["mcp-session-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let _ = result(initialized).await;

    let listed = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
            Some(&session),
        )
        .await,
    )
    .await;
    let edit_tool = listed["tools"]
        .as_array()
        .unwrap()
        .iter()
        .find(|tool| tool["name"] == "edit_watchlist_items")
        .unwrap();
    assert_eq!(edit_tool["annotations"]["readOnlyHint"], false);
    assert_eq!(edit_tool["annotations"]["destructiveHint"], false);
    assert_eq!(edit_tool["annotations"]["idempotentHint"], false);
    assert!(
        edit_tool["description"]
            .as_str()
            .unwrap()
            .contains("title, release date, and poster image")
    );
    assert_eq!(
        edit_tool["inputSchema"]["properties"]["edits"]["items"]["properties"]["posterImage"]["type"],
        json!(["string", "null"])
    );
    assert_eq!(
        edit_tool["outputSchema"]["properties"]["results"]["items"]["required"],
        json!(["index", "success", "code", "message"])
    );

    for malformed in [
        json!({"edits": []}),
        json!({"edits": [{"watchlistId": 41, "watchlistItemId": 101, "title": null}]}),
        json!({"edits": [{"watchlistId": "41", "watchlistItemId": 101, "title": "Bad"}]}),
        json!({"edits": [{"watchlistId": 41, "watchlistItemId": 101, "posterImage": 123}]}),
    ] {
        let rejected = rpc(
            &app,
            json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"edit_watchlist_items","arguments":malformed}}),
            Some(&session),
        )
        .await;
        let payload: Value = serde_json::from_str(&body(rejected).await).unwrap();
        assert_eq!(payload["error"]["code"], -32602, "{payload}");
    }

    let batch = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"edit_watchlist_items","arguments":{"edits":[
                {
                    "watchlistId": 41,
                    "watchlistItemId": 101,
                    "title": "  Edited via MCP  ",
                    "releaseDate": "2025-02-03",
                    "posterImage": "https://images.example.com/edited.jpg"
                },
                {
                    "watchlistId": 41,
                    "watchlistItemId": 999999,
                    "title": "Missing",
                    "releaseDate": null,
                    "posterImage": null
                },
                {
                    "watchlistId": 41,
                    "watchlistItemId": 101,
                    "title": "   "
                },
                {
                    "watchlistId": 41,
                    "watchlistItemId": 101,
                    "posterImage": "http://insecure.example.com/poster.jpg"
                },
                {
                    "watchlistId": 41,
                    "watchlistItemId": 101,
                    "releaseDate": ""
                },
                {
                    "watchlistId": 41,
                    "watchlistItemId": 101,
                    "posterImage": ""
                },
                {
                    "watchlistId": 41,
                    "watchlistItemId": 101
                },
                {
                    "watchlistId": 41,
                    "watchlistItemId": 102,
                    "releaseDate": null,
                    "posterImage": null
                }
            ]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    assert!(batch.get("isError").is_none());
    let results = batch["structuredContent"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 8);
    assert_eq!(
        results[0],
        json!({
            "index": 0,
            "success": true,
            "code": "edited",
            "message": "Watchlist item edited.",
            "watchlistId": 41,
            "watchlistItemId": 101
        })
    );
    assert_eq!(
        results[1],
        json!({
            "index": 1,
            "success": false,
            "code": "not_found",
            "message": "Watchlist item not found.",
            "watchlistId": 41,
            "watchlistItemId": 999999
        })
    );
    assert_eq!(results[2]["code"], "validation_error");
    assert_eq!(results[2]["message"], "Title is required.");
    assert_eq!(results[3]["code"], "validation_error");
    assert_eq!(
        results[3]["message"],
        "Poster image must be an HTTPS URL or a provider path beginning with /."
    );
    assert_eq!(results[4]["code"], "validation_error");
    assert_eq!(
        results[4]["message"],
        "Release date must be YYYY or YYYY-MM-DD."
    );
    assert_eq!(results[5]["code"], "validation_error");
    assert_eq!(
        results[5]["message"],
        "Poster image must be an HTTPS URL or a provider path beginning with /."
    );
    assert_eq!(results[6]["code"], "validation_error");
    assert_eq!(results[6]["message"], "No fields to update.");
    assert_eq!(results[7]["code"], "edited");
    assert_eq!(results[7]["watchlistItemId"], 102);

    let persisted_101 = lists.item(41, 101).await.unwrap().unwrap();
    assert_eq!(persisted_101.title, "Edited via MCP");
    assert_eq!(persisted_101.release_date.as_deref(), Some("2025-02-03"));
    assert_eq!(
        persisted_101.poster_path.as_deref(),
        Some("https://images.example.com/edited.jpg")
    );
    let persisted_102 = lists.item(41, 102).await.unwrap().unwrap();
    assert_eq!(persisted_102.title, "Second");
    assert_eq!(persisted_102.release_date, None);
    assert_eq!(persisted_102.poster_path, None);

    change_v1(&fixture, "reject-item-title");
    let isolated_error = result(
        rpc(
            &app,
            json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"edit_watchlist_items","arguments":{"edits":[
                {"watchlistId": 41, "watchlistItemId": 101, "title": "Aborted"},
                {"watchlistId": 41, "watchlistItemId": 103, "title": "Survives"}
            ]}}}),
            Some(&session),
        )
        .await,
    )
    .await;
    let isolated_results = isolated_error["structuredContent"]["results"]
        .as_array()
        .unwrap();
    assert_eq!(isolated_results[0]["code"], "internal_error");
    assert_eq!(isolated_results[1]["code"], "edited");
    assert_eq!(
        lists.item(41, 103).await.unwrap().unwrap().title,
        "Survives"
    );
}
