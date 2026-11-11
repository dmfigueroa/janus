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
        .route("/", get(features::smoke::page))
        .route("/health/live", get(|| async { "live" }))
        .route(
            "/health/ready",
            get(|| async {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Database compatibility has not been validated",
                )
            }),
        )
        .route(
            "/static/app.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css")],
                    include_str!("../static/app.css"),
                )
            }),
        )
        .route(
            "/static/app.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript")],
                    include_str!("../static/app.js"),
                )
            }),
        )
        .route(
            "/static/vendor/htmx.min.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript")],
                    include_str!("../static/vendor/htmx.min.js"),
                )
            }),
        )
        .route(
            "/static/vendor/Sortable.min.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript")],
                    include_str!("../static/vendor/Sortable.min.js"),
                )
            }),
        )
        .nest_service("/mcp", mcp)
        .fallback(|| async { (StatusCode::NOT_FOUND, "Page not found") })
}
