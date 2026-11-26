use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};
use tower::ServiceExt;

static NEXT_FIXTURE: AtomicUsize = AtomicUsize::new(0);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    tools: ToolManifest,
    fixture: FixtureData,
    cases: Vec<ComplianceCase>,
}

#[derive(Deserialize)]
struct ToolManifest {
    ported: Vec<PortedTool>,
    pending: Vec<String>,
}

#[derive(Deserialize)]
struct PortedTool {
    name: String,
    title: String,
    description: String,
    annotations: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureData {
    watchlists: Vec<FixtureWatchlist>,
    watchlist_items: Vec<FixtureWatchlistItem>,
}

#[derive(Deserialize)]
struct FixtureWatchlist {
    id: i64,
    name: String,
    description: Option<String>,
    item_order_mode: String,
    created_at: String,
    updated_at: Option<String>,
    last_watched_at: Option<String>,
    last_item_added_at: Option<String>,
    paused_at: Option<String>,
}

#[derive(Deserialize)]
struct FixtureWatchlistItem {
    id: i64,
    watchlist_id: i64,
    tmdb_id: String,
    source: String,
    media_type: String,
    title: String,
    parent_id: Option<String>,
    parent_title: Option<String>,
    season: Option<i64>,
    episode: Option<String>,
    poster_path: Option<String>,
    release_date: Option<String>,
    vote_average: Option<f64>,
    runtime: Option<i64>,
    custom_rank: Option<i64>,
    is_watched: i64,
    authors: Option<Vec<String>>,
    added_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ComplianceCase {
    id: String,
    mutating: bool,
    #[serde(default)]
    setup_sql: Vec<String>,
    #[serde(default)]
    expect_fully_ranked_watchlists: Vec<i64>,
    steps: Vec<ComplianceStep>,
}

#[derive(Deserialize)]
struct ComplianceStep {
    tool: String,
    arguments: Map<String, Value>,
    expect: StepExpectation,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StepExpectation {
    kind: String,
    error_contains: Option<String>,
    has_cursor: Option<bool>,
    has_order_token: Option<bool>,
}

struct MigratedFixture(PathBuf);

impl MigratedFixture {
    fn create() -> Self {
        let path = std::env::temp_dir().join(format!(
            "janus-v2-mcp-contract-{}-{}.db",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        let status = Command::new(std::env::var("JANUS_TEST_NODE").unwrap_or("node".into()))
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/create_mcp_contract_fixture.cjs"
            ))
            .arg(&path)
            .status()
            .unwrap();
        assert!(
            status.success(),
            "contract fixture creation requires installed pnpm dependencies and pinned Node"
        );
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for MigratedFixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
        for suffix in ["-wal", "-shm"] {
            let mut sidecar = self.0.as_os_str().to_os_string();
            sidecar.push(suffix);
            let _ = std::fs::remove_file(sidecar);
        }
    }
}

fn load_contract() -> Contract {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../contracts/mcp-watchlists.json");
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    serde_json::from_str(&raw).expect("valid MCP contract JSON")
}

fn statement(sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}

async fn reset_and_seed(
    database: &DatabaseConnection,
    fixture: &FixtureData,
    setup_sql: &[String],
) {
    for sql in [
        "DELETE FROM lineup_watchlists",
        "DELETE FROM lineups",
        "DELETE FROM watchlist_items",
        "DELETE FROM watchlists",
    ] {
        database.execute_raw(statement(sql, vec![])).await.unwrap();
    }
    let has_sequence = database
        .query_one_raw(statement(
            "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
            vec![],
        ))
        .await
        .unwrap()
        .is_some();
    if has_sequence {
        database
            .execute_raw(statement("DELETE FROM sqlite_sequence", vec![]))
            .await
            .unwrap();
    }

    for watchlist in &fixture.watchlists {
        database
            .execute_raw(statement(
                "INSERT INTO watchlists(id, name, description, item_order_mode, created_at, updated_at, last_watched_at, last_item_added_at, paused_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    watchlist.id.into(),
                    watchlist.name.clone().into(),
                    watchlist.description.clone().into(),
                    watchlist.item_order_mode.clone().into(),
                    watchlist.created_at.clone().into(),
                    watchlist.updated_at.clone().into(),
                    watchlist.last_watched_at.clone().into(),
                    watchlist.last_item_added_at.clone().into(),
                    watchlist.paused_at.clone().into(),
                ],
            ))
            .await
            .unwrap();
    }

    for item in &fixture.watchlist_items {
        let authors = item
            .authors
            .as_ref()
            .map(|list| serde_json::to_string(list).unwrap());
        database
            .execute_raw(statement(
                "INSERT INTO watchlist_items(id, watchlist_id, tmdb_id, source, media_type, title, parent_id, parent_title, season, episode, poster_path, release_date, vote_average, runtime, custom_rank, is_watched, authors, added_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    item.id.into(),
                    item.watchlist_id.into(),
                    item.tmdb_id.clone().into(),
                    item.source.clone().into(),
                    item.media_type.clone().into(),
                    item.title.clone().into(),
                    item.parent_id.clone().into(),
                    item.parent_title.clone().into(),
                    item.season.into(),
                    item.episode.clone().into(),
                    item.poster_path.clone().into(),
                    item.release_date.clone().into(),
                    item.vote_average.into(),
                    item.runtime.into(),
                    item.custom_rank.into(),
                    item.is_watched.into(),
                    authors.into(),
                    item.added_at.clone().into(),
                ],
            ))
            .await
            .unwrap();
    }

    for sql in setup_sql {
        database.execute_raw(statement(sql, vec![])).await.unwrap();
    }
}

async fn assert_check_rep(database: &DatabaseConnection, fully_ranked_watchlists: &[i64]) {
    let violations = database
        .query_all_raw(statement("PRAGMA foreign_key_check", vec![]))
        .await
        .unwrap();
    assert!(
        violations.is_empty(),
        "PRAGMA foreign_key_check found {} violations",
        violations.len()
    );

    let watchlists = database
        .query_all_raw(statement(
            "SELECT id, name, item_order_mode FROM watchlists ORDER BY id ASC",
            vec![],
        ))
        .await
        .unwrap();
    let mut custom_watchlists = BTreeSet::new();
    for row in watchlists {
        let id = row.try_get::<i64>("", "id").unwrap();
        let name = row.try_get::<String>("", "name").unwrap();
        let mode = row.try_get::<String>("", "item_order_mode").unwrap();
        assert!(!name.trim().is_empty(), "watchlist {id} has empty name");
        assert!(
            matches!(mode.as_str(), "release" | "custom"),
            "watchlist {id} invalid item_order_mode {mode}"
        );
        if mode == "custom" {
            custom_watchlists.insert(id);
        }
    }

    let items = database
        .query_all_raw(statement(
            "SELECT id, watchlist_id, media_type, title, custom_rank, is_watched, authors FROM watchlist_items ORDER BY watchlist_id ASC, id ASC",
            vec![],
        ))
        .await
        .unwrap();
    let mut items_by_watchlist: BTreeMap<i64, Vec<Option<i64>>> = BTreeMap::new();
    for row in items {
        let id = row.try_get::<i64>("", "id").unwrap();
        let watchlist_id = row.try_get::<i64>("", "watchlist_id").unwrap();
        let media_type = row.try_get::<String>("", "media_type").unwrap();
        let title = row.try_get::<String>("", "title").unwrap();
        let custom_rank = row.try_get::<Option<i64>>("", "custom_rank").unwrap();
        let is_watched = row.try_get::<i64>("", "is_watched").unwrap();
        let authors = row.try_get::<Option<String>>("", "authors").unwrap();

        assert!(
            matches!(
                media_type.as_str(),
                "movie" | "episode" | "game" | "book" | "comic" | "anime" | "manga"
            ),
            "item {id} invalid media_type {media_type}"
        );
        assert!(!title.trim().is_empty(), "item {id} has empty title");
        assert!(
            matches!(is_watched, 0 | 1),
            "item {id} invalid is_watched {is_watched}"
        );
        if let Some(raw_authors) = authors {
            let parsed: Vec<String> = serde_json::from_str(&raw_authors)
                .unwrap_or_else(|error| panic!("item {id} invalid authors JSON: {error}"));
            let _ = parsed;
        }
        items_by_watchlist
            .entry(watchlist_id)
            .or_default()
            .push(custom_rank);
    }

    let require_full: BTreeSet<i64> = fully_ranked_watchlists.iter().copied().collect();
    for watchlist_id in custom_watchlists {
        let Some(ranks_raw) = items_by_watchlist.get(&watchlist_id) else {
            continue;
        };
        if ranks_raw.is_empty() {
            continue;
        }
        let mut ranked: Vec<i64> = ranks_raw.iter().filter_map(|rank| *rank).collect();
        ranked.sort_unstable();
        assert!(
            !ranked.is_empty(),
            "custom watchlist {watchlist_id} has {} items but zero custom_rank values",
            ranks_raw.len()
        );
        if require_full.contains(&watchlist_id) {
            assert_eq!(
                ranked.len(),
                ranks_raw.len(),
                "custom watchlist {watchlist_id} expected all {} items ranked",
                ranks_raw.len()
            );
        }
        let expected: Vec<i64> = (1..=ranked.len() as i64).collect();
        assert_eq!(
            ranked, expected,
            "custom watchlist {watchlist_id} ranks must be contiguous 1..K without gaps or duplicates"
        );
    }
}

async fn rpc_json(app: &axum::Router, message: Value, session: Option<&str>) -> Value {
    let mut request = Request::builder()
        .method("POST")
        .uri("/v2/mcp")
        .header("content-type", "application/json")
        .header("accept", "application/json, text/event-stream")
        .header("host", "localhost:3001");
    if let Some(session) = session {
        request = request.header("mcp-session-id", session);
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(message.to_string())).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
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
                            "clientInfo": {"name": "v2-compliance", "version": "1.0.0"}
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
    let _ = app
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
    session
}

fn resolve_arguments(
    raw: &Map<String, Value>,
    previous_cursor: Option<&str>,
) -> Map<String, Value> {
    raw.iter()
        .map(|(key, value)| {
            let resolved = if value.as_str() == Some("$prev.nextCursor") {
                Value::String(
                    previous_cursor
                        .expect("step referenced $prev.nextCursor without a prior cursor")
                        .to_owned(),
                )
            } else {
                value.clone()
            };
            (key.clone(), resolved)
        })
        .collect()
}

#[tokio::test]
async fn v2_satisfies_shared_mcp_contract_pending_manifest_and_check_rep() {
    let contract = load_contract();
    let fixture = MigratedFixture::create();
    let database = janus_v2::open_database(fixture.path()).await.unwrap();
    let app = janus_v2::database_router(database.clone());
    let session = init_session(&app).await;

    let listed = rpc_json(
        &app,
        json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
        Some(&session),
    )
    .await;
    let declared_tools = listed["result"]["tools"].as_array().unwrap();
    let declared_by_name: BTreeMap<&str, &Value> = declared_tools
        .iter()
        .map(|tool| (tool["name"].as_str().unwrap(), tool))
        .collect();
    let expected_ported: BTreeSet<&str> = contract
        .tools
        .ported
        .iter()
        .map(|tool| tool.name.as_str())
        .collect();
    let actual_names: BTreeSet<&str> = declared_by_name.keys().copied().collect();
    assert_eq!(
        actual_names, expected_ported,
        "v2 tools/list drifted from contracts/mcp-watchlists.json ported tools"
    );

    for expected in &contract.tools.ported {
        let actual = declared_by_name[expected.name.as_str()];
        assert_eq!(actual["title"], expected.title, "{} title", expected.name);
        assert_eq!(
            actual["description"], expected.description,
            "{} description",
            expected.name
        );
        assert_eq!(
            actual["annotations"], expected.annotations,
            "{} annotations",
            expected.name
        );
    }

    let mut rpc_id = 10_i64;
    for pending_tool in &contract.tools.pending {
        assert!(
            !declared_by_name.contains_key(pending_tool.as_str()),
            "pending tool {pending_tool} is now listed in v2 tools/list; graduate it to ported in contracts/mcp-watchlists.json"
        );
        let response = rpc_json(
            &app,
            json!({
                "jsonrpc": "2.0",
                "id": rpc_id,
                "method": "tools/call",
                "params": { "name": pending_tool, "arguments": {} }
            }),
            Some(&session),
        )
        .await;
        rpc_id += 1;
        assert_eq!(
            response["error"]["code"], -32601,
            "pending tool {pending_tool} unexpectedly stopped returning -32601: {response}"
        );
    }

    for case in &contract.cases {
        reset_and_seed(&database, &contract.fixture, &case.setup_sql).await;
        let mut previous_cursor: Option<String> = None;

        for (step_index, step) in case.steps.iter().enumerate() {
            let arguments = resolve_arguments(&step.arguments, previous_cursor.as_deref());
            let payload = rpc_json(
                &app,
                json!({
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "method": "tools/call",
                    "params": { "name": step.tool, "arguments": arguments }
                }),
                Some(&session),
            )
            .await;
            rpc_id += 1;

            match step.expect.kind.as_str() {
                "ok" => {
                    let result = payload.get("result").unwrap_or_else(|| {
                        panic!("case {} step {step_index} expected ok: {payload}", case.id)
                    });
                    assert!(
                        result.get("isError") != Some(&Value::Bool(true)),
                        "case {} step {step_index} returned tool error: {payload}",
                        case.id
                    );
                    let structured = &result["structuredContent"];
                    let text_json: Value =
                        serde_json::from_str(result["content"][0]["text"].as_str().unwrap())
                            .unwrap();
                    assert_eq!(
                        &text_json, structured,
                        "case {} step {step_index} content text must mirror structuredContent",
                        case.id
                    );
                    if let Some(has_cursor) = step.expect.has_cursor {
                        assert_eq!(
                            structured.get("nextCursor").is_some_and(Value::is_string),
                            has_cursor,
                            "case {} step {step_index} cursor expectation mismatch: {structured}",
                            case.id
                        );
                    }
                    if let Some(has_order_token) = step.expect.has_order_token {
                        assert_eq!(
                            structured.get("orderToken").is_some_and(|token| {
                                token
                                    .as_str()
                                    .is_some_and(|text| text.starts_with("sha256:"))
                            }),
                            has_order_token,
                            "case {} step {step_index} orderToken expectation mismatch: {structured}",
                            case.id
                        );
                    }
                    previous_cursor = structured
                        .get("nextCursor")
                        .and_then(Value::as_str)
                        .map(str::to_owned);
                }
                "toolError" => {
                    let result = payload.get("result").unwrap_or_else(|| {
                        panic!(
                            "case {} step {step_index} expected toolError: {payload}",
                            case.id
                        )
                    });
                    assert_eq!(
                        result["isError"],
                        Value::Bool(true),
                        "case {} step {step_index} expected isError=true: {payload}",
                        case.id
                    );
                    if let Some(expected_text) = &step.expect.error_contains {
                        let actual_text = result["content"][0]["text"].as_str().unwrap_or("");
                        assert!(
                            actual_text.contains(expected_text),
                            "case {} step {step_index} error '{actual_text}' did not contain '{expected_text}'",
                            case.id
                        );
                    }
                }
                "rpcInvalidParams" => {
                    assert_eq!(
                        payload["error"]["code"], -32602,
                        "case {} step {step_index} expected JSON-RPC -32602: {payload}",
                        case.id
                    );
                }
                other => panic!("unknown expectation kind: {other}"),
            }
        }

        if case.mutating {
            assert_check_rep(&database, &case.expect_fully_ranked_watchlists).await;
        }
    }
}
