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
    assert!(html.contains("https://image.tmdb.org/t/p/w200/poster.jpg"));
    assert!(html.contains("https://images.example/poster.jpg"));
    assert!(html.contains("class=\"timeline\""), "{html}");
    assert!(html.contains("id=\"reorder-recovery\""), "{html}");
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
    assert_eq!(tools["tools"].as_array().unwrap().len(), 7);
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
    assert_eq!(tools.len(), 7);
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
