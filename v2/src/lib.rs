mod features;

use axum::{
    Router,
    http::{StatusCode, header},
    routing::get,
};
use rmcp::transport::streamable_http_server::{
    StreamableHttpService, session::local::LocalSessionManager,
};
use std::sync::Arc;

#[derive(Clone)]
struct SetupMcp;
impl rmcp::ServerHandler for SetupMcp {}

pub fn router() -> Router {
    let mcp = StreamableHttpService::new(
        || Ok(SetupMcp),
        Arc::new(LocalSessionManager::default()),
        Default::default(),
    );
    Router::new()
        .route("/v2", get(features::smoke::page))
        .route("/v2/", get(features::smoke::page))
        .route("/v2/health/live", get(|| async { "live" }))
        .route(
            "/v2/health/ready",
            get(|| async {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Database compatibility has not been validated",
                )
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
        .nest_service("/v2/mcp", mcp)
        .fallback(|| async { (StatusCode::NOT_FOUND, "Page not found") })
}
