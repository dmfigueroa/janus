use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use sha2::{Digest, Sha256};
use tower::ServiceExt;

#[test]
fn embedded_assets_are_versioned_by_their_bytes() {
    let assets = janus_v2::static_assets();
    assert!(!assets.is_empty());
    for asset in assets {
        let digest = Sha256::digest(asset.bytes);
        let version: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
        assert_eq!(asset.version, version, "{}", asset.path);
        assert_eq!(asset.url, format!("/v2/static/{}?v={version}", asset.path));
    }
}

async fn get(uri: &str) -> axum::response::Response {
    janus_v2::router()
        .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn every_asset_carries_its_revalidation_contract() {
    for asset in janus_v2::static_assets() {
        let etag = format!("\"{}\"", asset.version);

        let versioned = get(asset.url).await;
        assert_eq!(versioned.status(), StatusCode::OK, "{}", asset.path);
        assert_eq!(
            versioned.headers()[header::CONTENT_TYPE],
            asset.content_type,
            "{}",
            asset.path
        );
        assert_eq!(
            versioned.headers()[header::CACHE_CONTROL],
            "public, max-age=31536000, immutable",
            "{}",
            asset.path
        );
        assert_eq!(
            versioned.headers()[header::ETAG].to_str().unwrap(),
            etag,
            "{}",
            asset.path
        );

        for uri in [
            format!("/v2/static/{}", asset.path),
            format!("/v2/static/{}?v=stale", asset.path),
        ] {
            let revalidated = get(&uri).await;
            assert_eq!(revalidated.status(), StatusCode::OK, "{uri}");
            assert_eq!(
                revalidated.headers()[header::CACHE_CONTROL],
                "no-cache",
                "{uri}"
            );
            assert_eq!(
                revalidated.headers()[header::ETAG].to_str().unwrap(),
                etag,
                "{uri}"
            );

            let not_modified = janus_v2::router()
                .oneshot(
                    Request::builder()
                        .uri(&uri)
                        .header(header::IF_NONE_MATCH, &etag)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(not_modified.status(), StatusCode::NOT_MODIFIED, "{uri}");
            assert_eq!(
                not_modified.headers()[header::ETAG].to_str().unwrap(),
                etag,
                "{uri}"
            );
            assert!(
                not_modified
                    .into_body()
                    .collect()
                    .await
                    .unwrap()
                    .to_bytes()
                    .is_empty(),
                "{uri}"
            );
        }
    }
}

#[tokio::test]
async fn html_pages_revalidate_before_reusing_cached_markup() {
    let page = get("/v2").await;
    assert_eq!(page.status(), StatusCode::OK);
    assert_eq!(page.headers()[header::CACHE_CONTROL], "no-cache");
    let etag = page.headers()[header::ETAG].to_str().unwrap().to_string();

    let revalidated = janus_v2::router()
        .oneshot(
            Request::builder()
                .uri("/v2")
                .header(header::IF_NONE_MATCH, &etag)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(revalidated.status(), StatusCode::NOT_MODIFIED);
    assert_eq!(revalidated.headers()[header::ETAG].to_str().unwrap(), etag);
    assert!(
        revalidated
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .is_empty()
    );

    let liveness = get("/v2/health/live").await;
    assert!(
        liveness.headers().get(header::CACHE_CONTROL).is_none(),
        "non-HTML responses keep their own cache policy"
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
async fn pages_reference_the_content_addressed_assets() {
    let response = janus_v2::router()
        .oneshot(Request::builder().uri("/v2").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body = String::from_utf8(body.to_vec()).unwrap();
    for (attribute, path) in [("href", "app.css"), ("src", "app.js")] {
        let url = janus_v2::asset_url(path).unwrap();
        assert!(
            body.contains(&format!("{attribute}=\"{url}\"")),
            "{path} missing from {body}"
        );
    }
}

#[tokio::test]
async fn unknown_and_private_assets_are_not_found() {
    for path in ["/v2/static/missing.css", "/v2/static/vendor/README.md"] {
        let response = janus_v2::router()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{path}");
    }
}

#[tokio::test]
async fn mcp_initializes_in_the_web_process_without_product_tools() {
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
