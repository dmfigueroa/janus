//! Content-addressed browser assets served by the application.
use axum::{
    extract::Query,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::collections::HashMap;

/// Content version of the stylesheet bytes embedded in this build.
pub const APP_CSS_VERSION: &str = env!("JANUS_APP_CSS_VERSION");

/// Stylesheet URL whose query changes whenever the stylesheet bytes change.
pub const APP_CSS_URL: &str = concat!("/v2/static/app.css?v=", env!("JANUS_APP_CSS_VERSION"));

/// Stylesheet source shipped with this build.
const APP_CSS: &str = include_str!("../static/app.css");

/// Versioned URLs are immutable; other URLs must revalidate against the ETag.
const VERSIONED_CACHE: &str = "public, max-age=31536000, immutable";
const REVALIDATING_CACHE: &str = "no-cache";

/// Serve the stylesheet with cache policy and validator derived from its bytes.
pub async fn app_css(headers: HeaderMap, Query(query): Query<HashMap<String, String>>) -> Response {
    let versioned = query.get("v").is_some_and(|value| value == APP_CSS_VERSION);
    let etag = format!("\"{APP_CSS_VERSION}\"");
    let cache_control = if versioned {
        VERSIONED_CACHE
    } else {
        REVALIDATING_CACHE
    };
    let validators = [
        (header::CONTENT_TYPE, HeaderValue::from_static("text/css")),
        (
            header::CACHE_CONTROL,
            HeaderValue::from_static(cache_control),
        ),
        (
            header::ETAG,
            HeaderValue::from_str(&etag).expect("a quoted hash is a valid header value"),
        ),
    ];
    if not_modified(&headers, &etag) {
        return (StatusCode::NOT_MODIFIED, validators).into_response();
    }
    (validators, APP_CSS).into_response()
}

fn not_modified(headers: &HeaderMap, etag: &str) -> bool {
    headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value.split(',').map(str::trim).any(|candidate| {
                candidate == "*"
                    || candidate == etag
                    || candidate
                        .strip_prefix("W/")
                        .is_some_and(|candidate| candidate == etag)
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use askama::Template;

    #[derive(Template)]
    #[template(path = "layout.html")]
    struct LayoutProbe;

    #[test]
    fn shared_layout_references_the_content_addressed_stylesheet() {
        let layout = LayoutProbe.render().unwrap();
        assert!(
            layout.contains(&format!("href=\"{APP_CSS_URL}\"")),
            "{layout}"
        );
        assert!(!layout.contains("app.css?v=4"), "{layout}");
    }

    #[test]
    fn stylesheet_url_carries_the_current_version() {
        let versioned = url_version(APP_CSS_URL);
        assert_eq!(versioned, APP_CSS_VERSION);
    }

    fn url_version(url: &str) -> &str {
        url.rsplit_once("?v=")
            .map(|(_, version)| version)
            .expect("the stylesheet URL carries a version query")
    }
}
