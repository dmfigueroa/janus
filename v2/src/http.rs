//! Shared browser/API transport policy. Feature handlers own their representations.
use axum::{
    Form, Json,
    extract::{FromRequest, FromRequestParts, Request},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header, request::Parts},
    middleware::Next,
    response::{Html, IntoResponse, Response},
};
use serde::{Serialize, de::DeserializeOwned};
use std::{convert::Infallible, future::Future};

/// Delegate body decoding and rejection responses to Axum's native extractors.
pub struct FormOrJson<T>(pub T);

impl<S, T> FromRequest<S> for FormOrJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = Response;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let json = request
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("application/json"));
        if json {
            Json::<T>::from_request(request, state)
                .await
                .map(|Json(value)| Self(value))
                .map_err(IntoResponse::into_response)
        } else {
            Form::<T>::from_request(request, state)
                .await
                .map(|Form(value)| Self(value))
                .map_err(IntoResponse::into_response)
        }
    }
}

const API_VARY: &str = "HX-Request, Accept";
const BROWSE_VARY: &str = "HX-Request, HX-History-Restore-Request, Accept";

/// HTML is the deploy's unversioned entry point, so it must be revalidated before reuse.
const HTML_CACHE: &str = "no-cache";

/// Make every HTML response revalidate so new markup cannot reuse an older deploy's assets.
///
/// Versioned asset URLs still serve as immutable; this policy covers the document that
/// references them, which is the only response whose URL does not change with its bytes.
pub async fn revalidate_html(request: Request, next: Next) -> Response {
    let revalidating = matches!(*request.method(), Method::GET | Method::HEAD);
    let if_none_match = request.headers().get(header::IF_NONE_MATCH).cloned();
    let response = next.run(request).await;
    if !revalidating || !is_html(&response) {
        return response;
    }

    let (mut parts, body) = response.into_parts();
    let Ok(bytes) = axum::body::to_bytes(body, usize::MAX).await else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to read HTML response",
        )
            .into_response();
    };
    let etag = content_etag(&bytes);
    parts
        .headers
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(HTML_CACHE));
    parts.headers.insert(
        header::ETAG,
        HeaderValue::from_str(&etag).expect("a quoted hash is a valid header value"),
    );
    parts.headers.remove(header::CONTENT_LENGTH);

    if if_none_match_matches(if_none_match.as_ref(), &etag) {
        parts.status = StatusCode::NOT_MODIFIED;
        return Response::from_parts(parts, axum::body::Body::empty());
    }
    Response::from_parts(parts, axum::body::Body::from(bytes))
}

fn is_html(response: &Response) -> bool {
    response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("text/html"))
}

/// Strong validator derived from the exact bytes of a response body.
fn content_etag(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("\"{:x}\"", Sha256::digest(bytes))
}

/// Whether an `If-None-Match` field value admits the strong validator `etag`.
pub(crate) fn if_none_match_matches(value: Option<&HeaderValue>, etag: &str) -> bool {
    value
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

/// The representation a handler should return.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResponseFormat {
    /// Full document for ordinary browser navigation.
    Page,
    /// HTML fragment for HTMX swaps.
    Html,
    Json,
}

/// HTMX and explicit HTML requests receive HTML; existing API callers default to JSON.
impl<S: Send + Sync> FromRequestParts<S> for ResponseFormat {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        Ok(select_representation(&parts.headers, OrdinaryDefault::Json))
    }
}

/// Browse defaults to a full page and reserves fragments for HTMX swaps.
#[derive(Clone, Copy)]
pub struct BrowseFormat(ResponseFormat);

impl BrowseFormat {
    /// The representation selected for this request.
    pub fn representation(self) -> ResponseFormat {
        self.0
    }
}

impl<S: Send + Sync> FromRequestParts<S> for BrowseFormat {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        Ok(Self(select_representation(
            &parts.headers,
            OrdinaryDefault::Page,
        )))
    }
}

#[derive(Clone, Copy)]
enum OrdinaryDefault {
    Page,
    Json,
}

fn select_representation(headers: &HeaderMap, default: OrdinaryDefault) -> ResponseFormat {
    let enabled = |name: &str| headers.get(name).is_some_and(|value| value == "true");
    let accepts = |media_type: &str| {
        headers
            .get(header::ACCEPT)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains(media_type))
    };
    let browses = matches!(default, OrdinaryDefault::Page);
    if browses && enabled("hx-history-restore-request") {
        ResponseFormat::Page
    } else if enabled("hx-request") {
        ResponseFormat::Html
    } else if browses {
        if accepts("application/json") {
            ResponseFormat::Json
        } else {
            ResponseFormat::Page
        }
    } else if accepts("text/html") {
        ResponseFormat::Html
    } else {
        ResponseFormat::Json
    }
}

impl ResponseFormat {
    /// Evaluate HTML rendering only when requested, preserving the cheaper API path.
    ///
    /// # Errors
    /// Returns the error produced by the HTML renderer. The JSON path never runs it.
    pub async fn respond<T, E>(
        self,
        json: T,
        html: impl Future<Output = Result<Html<String>, E>>,
    ) -> Result<Response, E>
    where
        T: Serialize,
    {
        self.respond_with(API_VARY, json, html).await
    }

    async fn respond_with<T, E>(
        self,
        vary: &'static str,
        json: T,
        html: impl Future<Output = Result<Html<String>, E>>,
    ) -> Result<Response, E>
    where
        T: Serialize,
    {
        let response = match self {
            Self::Page | Self::Html => html.await?.into_response(),
            Self::Json => Json(json).into_response(),
        };
        Ok(([(header::VARY, vary)], response).into_response())
    }
}

impl BrowseFormat {
    /// Respond while advertising every representation input, including history restoration.
    ///
    /// # Errors
    /// Returns the error produced by the HTML renderer. JSON responses skip rendering.
    pub async fn respond<T, E>(
        self,
        json: T,
        html: impl Future<Output = Result<Html<String>, E>>,
    ) -> Result<Response, E>
    where
        T: Serialize,
    {
        self.0.respond_with(BROWSE_VARY, json, html).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, body::Body, http::StatusCode, routing::post};
    use http_body_util::BodyExt;
    use serde::Deserialize;
    use tower::ServiceExt;

    #[derive(Deserialize, Serialize)]
    struct Input {
        count: i64,
    }

    async fn handler(
        format: ResponseFormat,
        FormOrJson(input): FormOrJson<Input>,
    ) -> Result<Response, StatusCode> {
        format
            .respond(&input, async {
                Ok(Html(format!("<p>{}</p>", input.count)))
            })
            .await
    }

    async fn browse_handler(format: BrowseFormat) -> Response {
        let representation = format.representation();
        format
            .respond(&Input { count: 3 }, async move {
                Ok::<_, StatusCode>(Html(match representation {
                    ResponseFormat::Html => "<p>fragment</p>".to_string(),
                    ResponseFormat::Page | ResponseFormat::Json => "<html>page</html>".to_string(),
                }))
            })
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn formats_are_independent_of_body_encoding() {
        for (content_type, body) in [
            ("application/json", r#"{"count":3}"#),
            ("application/x-www-form-urlencoded", "count=3"),
        ] {
            for (header_name, header_value, expected) in [
                ("accept", "application/json", r#"{"count":3}"#),
                ("accept", "text/html", "<p>3</p>"),
                ("accept", "text/html, application/json", "<p>3</p>"),
                ("hx-request", "true", "<p>3</p>"),
                ("hx-request", "false", r#"{"count":3}"#),
            ] {
                let response = Router::new()
                    .route("/", post(handler))
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/")
                            .header(header::CONTENT_TYPE, content_type)
                            .header(header_name, header_value)
                            .body(Body::from(body))
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(response.headers()[header::VARY], "HX-Request, Accept");
                let bytes = response.into_body().collect().await.unwrap().to_bytes();
                assert_eq!(bytes.as_ref(), expected.as_bytes());
            }
        }
    }

    #[tokio::test]
    async fn browse_returns_pages_fragments_and_json_by_request() {
        for (headers, expected) in [
            (vec![], "<html>page</html>"),
            (vec![("accept", "text/html")], "<html>page</html>"),
            (vec![("accept", "application/json")], r#"{"count":3}"#),
            (
                vec![("accept", "text/html, application/json")],
                r#"{"count":3}"#,
            ),
            (vec![("hx-request", "true")], "<p>fragment</p>"),
            (
                vec![("hx-request", "true"), ("accept", "application/json")],
                "<p>fragment</p>",
            ),
            (
                vec![
                    ("hx-request", "true"),
                    ("hx-history-restore-request", "true"),
                ],
                "<html>page</html>",
            ),
            (
                vec![
                    ("hx-request", "true"),
                    ("hx-history-restore-request", "true"),
                    ("accept", "application/json"),
                ],
                "<html>page</html>",
            ),
            (
                vec![
                    ("hx-history-restore-request", "true"),
                    ("accept", "application/json"),
                ],
                "<html>page</html>",
            ),
        ] {
            let request = headers
                .iter()
                .fold(
                    Request::builder().uri("/").method("POST"),
                    |request, (name, value)| request.header(*name, *value),
                )
                .body(Body::empty())
                .unwrap();
            let response = Router::new()
                .route("/", post(browse_handler))
                .oneshot(request)
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                response.headers()[header::VARY],
                "HX-Request, HX-History-Restore-Request, Accept"
            );
            let bytes = response.into_body().collect().await.unwrap().to_bytes();
            assert_eq!(bytes.as_ref(), expected.as_bytes(), "{headers:?}");
        }
    }

    #[tokio::test]
    async fn malformed_bodies_preserve_axum_rejections() {
        for (content_type, body, expected) in [
            ("application/json", "{", StatusCode::BAD_REQUEST),
            (
                "application/json",
                r#"{"count":"bad"}"#,
                StatusCode::UNPROCESSABLE_ENTITY,
            ),
            (
                "application/x-www-form-urlencoded",
                "count=bad",
                StatusCode::UNPROCESSABLE_ENTITY,
            ),
            ("text/plain", "count=3", StatusCode::UNSUPPORTED_MEDIA_TYPE),
        ] {
            let response = Router::new()
                .route("/", post(handler))
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/")
                        .header(header::CONTENT_TYPE, content_type)
                        .body(Body::from(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
        }
    }

    #[tokio::test]
    async fn json_does_not_load_or_render_html() {
        let response = ResponseFormat::Json
            .respond(
                Input { count: 3 },
                std::future::ready(Err::<Html<String>, _>(StatusCode::INTERNAL_SERVER_ERROR)),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
    }
}
