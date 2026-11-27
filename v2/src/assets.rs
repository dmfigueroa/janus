//! Content-addressed static assets embedded into the binary at build time.
use axum::{
    extract::{Path, Query},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::collections::HashMap;

/// A static file embedded with the URL version derived from its bytes.
pub struct EmbeddedAsset {
    /// Path below `/v2/static`, using `/` as the separator.
    pub path: &'static str,
    /// Content version of [`Self::bytes`].
    pub version: &'static str,
    /// Versioned URL referenced by templates.
    pub url: &'static str,
    /// Browser content type declared when serving the asset.
    pub content_type: &'static str,
    /// Asset bytes as shipped in this build.
    pub bytes: &'static [u8],
}

include!(concat!(env!("OUT_DIR"), "/static_assets.rs"));

/// Assets embedded in this build, ordered by path.
pub fn static_assets() -> &'static [EmbeddedAsset] {
    EMBEDDED_ASSETS
}

/// Versioned URL for an embedded asset path, or `None` when no such asset was embedded.
pub fn asset_url(path: &str) -> Option<&'static str> {
    EMBEDDED_ASSETS
        .iter()
        .find(|asset| asset.path == path)
        .map(|asset| asset.url)
}

/// Versioned URLs are immutable; other URLs must revalidate against the ETag.
const VERSIONED_CACHE: &str = "public, max-age=31536000, immutable";
const REVALIDATING_CACHE: &str = "no-cache";

/// Serve an embedded asset with cache policy and validator derived from its bytes.
pub async fn serve(
    Path(path): Path<String>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let Some(asset) = EMBEDDED_ASSETS.iter().find(|asset| asset.path == path) else {
        return (StatusCode::NOT_FOUND, "Asset not found").into_response();
    };
    let versioned = query.get("v").is_some_and(|value| value == asset.version);
    let etag = format!("\"{}\"", asset.version);
    let cache_control = if versioned {
        VERSIONED_CACHE
    } else {
        REVALIDATING_CACHE
    };
    let validators = HeaderMap::from_iter([
        (
            header::CONTENT_TYPE,
            HeaderValue::from_static(asset.content_type),
        ),
        (
            header::CACHE_CONTROL,
            HeaderValue::from_static(cache_control),
        ),
        (
            header::ETAG,
            HeaderValue::from_str(&etag).expect("a quoted hash is a valid header value"),
        ),
    ]);

    if crate::http::if_none_match_matches(headers.get(header::IF_NONE_MATCH), &etag) {
        let mut response = Response::new(axum::body::Body::empty());
        *response.status_mut() = StatusCode::NOT_MODIFIED;
        *response.headers_mut() = validators;
        return response;
    }
    let mut response = Response::new(axum::body::Body::from(asset.bytes));
    *response.headers_mut() = validators;
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use askama::Template;

    #[derive(Template)]
    #[template(path = "layout.html")]
    struct LayoutProbe {
        nav: crate::features::PrimaryNav,
    }

    #[test]
    fn shared_layout_references_every_versioned_entry_asset() {
        let layout = LayoutProbe {
            nav: crate::features::PrimaryNav::lists(),
        }
        .render()
        .unwrap();
        for url in [
            APP_CSS_URL,
            APP_JS_URL,
            WATCHLIST_REORDER_GROUPS_JS_URL,
            WATCHLIST_REORDER_JS_URL,
            WATCHLIST_DIALOG_JS_URL,
            ITEM_EDIT_FIELDS_JS_URL,
            ITEM_EDIT_DIALOG_JS_URL,
            SEARCH_WATCHLIST_COMBOBOX_JS_URL,
            VENDOR_HTMX_MIN_JS_URL,
            VENDOR_SORTABLE_MIN_JS_URL,
            VENDOR_OPEN_PROPS_MIN_CSS_URL,
        ] {
            assert!(layout.contains(url), "{url} missing from {layout}");
        }
        assert!(layout.contains("<script type=\"importmap\">"));
        assert!(layout.contains("<script type=\"module\""));
        assert!(!layout.contains("app.css\""));
    }

    #[test]
    fn assets_without_a_browser_content_type_stay_private() {
        assert!(asset_url("vendor/README.md").is_none());
        assert!(asset_url("vendor/htmx.LICENSE").is_none());
    }
}
