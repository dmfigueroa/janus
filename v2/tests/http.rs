use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;

#[tokio::test]
async fn smoke_is_live_but_database_readiness_is_unavailable() {
    let application = janus_v2::router();
    for (path, expected) in [
        ("/v2", StatusCode::OK),
        ("/v2/health/live", StatusCode::OK),
        ("/v2/health/ready", StatusCode::SERVICE_UNAVAILABLE),
    ] {
        let response = application
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
}

#[tokio::test]
async fn browser_assets_are_served_locally() {
    for path in [
        "/v2/static/app.css",
        "/v2/static/app.js",
        "/v2/static/browse.js",
        "/v2/static/watchlist-dialog.js",
        "/v2/static/vendor/htmx.min.js",
        "/v2/static/vendor/Sortable.min.js",
    ] {
        let response = janus_v2::router()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().contains_key("content-type"));
    }
}

#[tokio::test]
async fn mcp_initializes_in_the_web_process_without_product_tools() {
    use http_body_util::BodyExt;
    let response = janus_v2::router().oneshot(
        Request::builder().method("POST").uri("/v2/mcp")
            .header("content-type", "application/json")
            .header("host", "localhost:3001")
            .header("accept", "application/json, text/event-stream")
            .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"setup-test","version":"1"}}}"#)).unwrap()
    ).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body = String::from_utf8(bytes.to_vec()).unwrap();
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.contains("serverInfo"), "{body}");
    assert!(!body.contains("tools"), "{body}");
}
