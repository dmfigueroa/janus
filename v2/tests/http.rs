use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use sha2::{Digest, Sha256};
use tower::ServiceExt;

#[test]
fn stylesheet_version_is_derived_from_its_bytes() {
    let digest = Sha256::digest(include_bytes!("../static/app.css"));
    let expected: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    assert_eq!(janus_v2::APP_CSS_VERSION, expected);
    assert_eq!(
        janus_v2::APP_CSS_URL,
        format!("/v2/static/app.css?v={expected}")
    );
}

#[tokio::test]
async fn stylesheet_cache_headers_agree_with_its_url_version() {
    let etag = format!("\"{}\"", janus_v2::APP_CSS_VERSION);
    let versioned = janus_v2::router()
        .oneshot(
            Request::builder()
                .uri(janus_v2::APP_CSS_URL)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(versioned.status(), StatusCode::OK);
    assert_eq!(
        versioned.headers()[header::CACHE_CONTROL],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(versioned.headers()[header::ETAG], etag.as_str());

    let revalidated = janus_v2::router()
        .oneshot(
            Request::builder()
                .uri("/v2/static/app.css?v=1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(revalidated.status(), StatusCode::OK);
    assert_eq!(revalidated.headers()[header::CACHE_CONTROL], "no-cache");
    assert_eq!(revalidated.headers()[header::ETAG], etag.as_str());

    let not_modified = janus_v2::router()
        .oneshot(
            Request::builder()
                .uri(janus_v2::APP_CSS_URL)
                .header(header::IF_NONE_MATCH, &etag)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(not_modified.status(), StatusCode::NOT_MODIFIED);
    assert!(
        not_modified
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .is_empty()
    );
}

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
async fn pages_reference_the_content_addressed_stylesheet() {
    let response = janus_v2::router()
        .oneshot(Request::builder().uri("/v2").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body = String::from_utf8(body.to_vec()).unwrap();
    assert!(
        body.contains(&format!("href=\"{}\"", janus_v2::APP_CSS_URL)),
        "{body}"
    );
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
        "/v2/static/vendor/open-props.min.css",
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
