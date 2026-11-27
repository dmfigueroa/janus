mod assets;
mod database;
pub mod integrations;
pub use assets::{EmbeddedAsset, asset_url, static_assets};
pub use database::open_database;
mod features;
mod http;

use axum::{
    Router,
    extract::FromRef,
    http::{StatusCode, header},
    routing::get,
};
use integrations::tmdb::{TmdbCatalog, TmdbClient};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use std::sync::Arc;

#[derive(Clone)]
struct SetupMcp;
impl rmcp::ServerHandler for SetupMcp {}

pub fn router() -> Router {
    base_router(false)
        .nest_service(
            "/v2/mcp",
            StreamableHttpService::new(
                || Ok(SetupMcp),
                sessions(),
                StreamableHttpServerConfig::default().with_json_response(true),
            ),
        )
        .layer(axum::middleware::from_fn(http::revalidate_html))
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
        .route("/v2/static/{*path}", get(assets::serve))
        .fallback(|| async { (StatusCode::NOT_FOUND, "Page not found") })
}

/// Router state. Watchlist handlers keep using [`Watchlists`] through [`FromRef`].
#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) lists: features::watchlists::Watchlists,
    pub(crate) catalog: Arc<dyn TmdbCatalog>,
}

impl FromRef<AppState> for features::watchlists::Watchlists {
    fn from_ref(state: &AppState) -> Self {
        state.lists.clone()
    }
}

/// Construct the feature router only after the existing database passes validation.
pub fn database_router(database: sea_orm::DatabaseConnection) -> Router {
    database_router_with(database, Arc::new(TmdbClient::from_env()))
}

/// Same router as [`database_router`] with a caller-supplied TMDB catalog.
pub fn database_router_with(
    database: sea_orm::DatabaseConnection,
    catalog: Arc<dyn TmdbCatalog>,
) -> Router {
    let state = AppState {
        lists: features::watchlists::Watchlists(database),
        catalog,
    };
    Router::new()
        .route(
            "/v2/watchlists",
            get(features::watchlists::web::list).post(features::watchlists::web::create),
        )
        .route(
            "/v2/watchlists/{id}",
            get(features::watchlists::web::detail).post(features::watchlists::web::update),
        )
        .route(
            "/v2/watchlists/{id}/reorder",
            axum::routing::post(features::watchlists::web::reorder),
        )
        .route(
            "/v2/watchlists/{id}/items/{item_id}/edit",
            get(features::watchlists::web::edit_item_form),
        )
        .route(
            "/v2/watchlists/{id}/items/{item_id}",
            axum::routing::post(features::watchlists::web::edit_item),
        )
        .route("/v2/search", get(features::search::web::search))
        .route("/v2/search/detail", get(features::search::web::detail))
        .route(
            "/v2/search/add",
            axum::routing::post(features::search::web::add),
        )
        .with_state(state.clone())
        .merge(base_router(true))
        .nest_service(
            "/v2/mcp",
            StreamableHttpService::new(
                move || {
                    Ok(features::watchlists::mcp::WatchlistMcp::new(
                        state.lists.clone(),
                        state.catalog.clone(),
                    ))
                },
                sessions(),
                StreamableHttpServerConfig::default().with_json_response(true),
            ),
        )
        .layer(axum::middleware::from_fn(mcp_compatibility))
        .layer(axum::middleware::from_fn(http::revalidate_html))
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

#[cfg(test)]
mod legacy_mcp_response_tests {
    use super::{StatusCode, header, legacy_json_response};

    const EIGHT_MIB: usize = 8 * 1024 * 1024;

    fn event_stream(bytes: Vec<u8>) -> axum::response::Response {
        axum::response::Response::builder()
            .header(header::CONTENT_TYPE, "text/event-stream")
            .body(axum::body::Body::from(bytes))
            .expect("event stream response")
    }

    async fn text(response: axum::response::Response) -> String {
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read test response");
        String::from_utf8(bytes.to_vec()).expect("utf-8 test response")
    }

    #[tokio::test]
    async fn sse_body_over_8_mib_is_rejected() {
        let response = legacy_json_response(event_stream(vec![b'x'; EIGHT_MIB + 1])).await;
        let status = response.status();
        let body = text(response).await;
        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE, "{body}");
    }

    #[tokio::test]
    async fn sse_body_at_8_mib_is_read_and_not_rejected_for_size() {
        let response = legacy_json_response(event_stream(vec![b'x'; EIGHT_MIB])).await;
        let status = response.status();
        let body = text(response).await;
        assert_ne!(status, StatusCode::PAYLOAD_TOO_LARGE, "{body}");
        assert_eq!(body, "Missing MCP response");
    }
}

pub use features::search;
pub use features::watchlists::addition;
pub use features::watchlists::{
    ItemOrderMode, WatchlistDetail, WatchlistItem, WatchlistRecord, WatchlistStats,
    WatchlistSummary, Watchlists,
    discovery::{
        DiscoveryError, DiscoveryOperation, DiscoveryRequest, GroupedTitle, ItemPage, ItemResults,
        SummaryPage,
    },
};
