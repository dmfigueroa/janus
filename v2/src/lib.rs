mod database;
pub use database::open_database;
mod features;
mod http;

use axum::{
    Router,
    http::{StatusCode, header},
    routing::get,
};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use std::sync::Arc;

#[derive(Clone)]
struct SetupMcp;
impl rmcp::ServerHandler for SetupMcp {}

pub fn router() -> Router {
    base_router(false).nest_service(
        "/v2/mcp",
        StreamableHttpService::new(
            || Ok(SetupMcp),
            sessions(),
            StreamableHttpServerConfig::default().with_json_response(true),
        ),
    )
}

fn base_router(database_ready: bool) -> Router {
    Router::new()
        .route("/v2", get(features::smoke::page))
        .route("/v2/", get(features::smoke::page))
        .route("/v2/health/live", get(|| async { "live" }))
        .route(
            "/v2/health/ready",
            get(move || async move {
                if database_ready {
                    (StatusCode::OK, "Database compatibility validated")
                } else {
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        "Database compatibility has not been validated",
                    )
                }
            }),
        )
        .route(
            "/v2/static/app.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css")],
                    include_str!("../static/app.css"),
                )
            }),
        )
        .route(
            "/v2/static/app.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript")],
                    include_str!("../static/app.js"),
                )
            }),
        )
        .route(
            "/v2/static/vendor/htmx.min.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript")],
                    include_str!("../static/vendor/htmx.min.js"),
                )
            }),
        )
        .route(
            "/v2/static/vendor/Sortable.min.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript")],
                    include_str!("../static/vendor/Sortable.min.js"),
                )
            }),
        )
        .fallback(|| async { (StatusCode::NOT_FOUND, "Page not found") })
}

/// Construct the feature router only after the existing database passes validation.
pub fn database_router(database: sea_orm::DatabaseConnection) -> Router {
    let state = features::watchlists::Watchlists(database);
    Router::new()
        .route("/v2/watchlists", get(features::watchlists::web::list))
        .route(
            "/v2/watchlists/{id}",
            get(features::watchlists::web::detail),
        )
        .route(
            "/v2/watchlists/{id}/reorder",
            axum::routing::post(features::watchlists::web::reorder),
        )
        .with_state(state.clone())
        .merge(base_router(true))
        .nest_service(
            "/v2/mcp",
            StreamableHttpService::new(
                move || Ok(features::watchlists::mcp::ReadMcp(state.clone())),
                sessions(),
                StreamableHttpServerConfig::default().with_json_response(true),
            ),
        )
        .layer(axum::middleware::from_fn(mcp_compatibility))
}

fn sessions() -> Arc<LocalSessionManager> {
    let mut manager = LocalSessionManager::default();
    manager.session_config.keep_alive = Some(std::time::Duration::from_secs(15 * 60));
    Arc::new(manager)
}

// Preserve v1's externally visible legacy transport responses around the SDK.
async fn mcp_compatibility(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let mcp = request.uri().path() == "/v2/mcp";
    let deleting = request.method() == axum::http::Method::DELETE;
    let posting = request.method() == axum::http::Method::POST;
    let mut response = next.run(request).await;
    if mcp && deleting && response.status() == StatusCode::ACCEPTED {
        *response.status_mut() = StatusCode::OK;
    }
    if mcp && response.status() == StatusCode::NOT_FOUND {
        use axum::response::IntoResponse;
        return (StatusCode::NOT_FOUND, "MCP session not found").into_response();
    }
    if mcp
        && posting
        && response
            .headers()
            .get(header::CONTENT_TYPE)
            .is_some_and(|value| value == "text/event-stream")
    {
        return legacy_json_response(response).await;
    }
    response
}

async fn legacy_json_response(response: axum::response::Response) -> axum::response::Response {
    use axum::response::IntoResponse;
    let (mut parts, body) = response.into_parts();
    let Ok(bytes) = axum::body::to_bytes(body, usize::MAX).await else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to read MCP response",
        )
            .into_response();
    };
    let terminal = String::from_utf8_lossy(&bytes)
        .lines()
        .filter_map(|line| line.strip_prefix("data: "))
        .filter_map(|data| serde_json::from_str::<serde_json::Value>(data).ok())
        .find(|message| {
            message.get("id").is_some()
                && (message.get("result").is_some() || message.get("error").is_some())
        });
    let Some(message) = terminal else {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Missing MCP response").into_response();
    };
    parts.headers.insert(
        header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/json"),
    );
    for key in [
        header::CONTENT_LENGTH,
        header::CACHE_CONTROL,
        header::CONNECTION,
    ] {
        parts.headers.remove(key);
    }
    axum::response::Response::from_parts(parts, axum::body::Body::from(message.to_string()))
}

pub use features::watchlists::{
    ItemOrderMode, WatchlistDetail, WatchlistItem, WatchlistRecord, WatchlistStats,
    WatchlistSummary, Watchlists,
    discovery::{
        DiscoveryError, DiscoveryOperation, DiscoveryRequest, GroupedTitle, ItemPage, ItemResults,
        SummaryPage,
    },
};
