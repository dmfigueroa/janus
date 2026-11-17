//! Shared browser/API transport policy. Feature handlers own their representations.
use axum::{
    Form, Json,
    extract::{FromRequest, FromRequestParts, Request},
    http::{HeaderMap, Method, header, request::Parts},
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
const PAGE_VARY: &str = "HX-Request, HX-History-Restore-Request, Accept";

/// The representation a handler should return.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Representation {
    /// Full document for ordinary browser navigation and history restoration.
    Page,
    /// HTML fragment for HTMX swaps.
    Html,
    Json,
}

/// The representation selected for a request and the inputs that selected it.
///
/// Feature handlers receive this instead of reading HTMX headers themselves, so
/// full-page, fragment and JSON responses share one selection and response path.
#[derive(Clone, Copy)]
pub struct ResponseFormat {
    representation: Representation,
    vary: &'static str,
}

impl ResponseFormat {
    /// The representation selected for this request.
    pub fn representation(self) -> Representation {
        self.representation
    }
}

/// Browser navigation defaults to a page and API calls default to JSON.
impl<S: Send + Sync> FromRequestParts<S> for ResponseFormat {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        Ok(select_representation(&parts.method, &parts.headers))
    }
}

fn select_representation(method: &Method, headers: &HeaderMap) -> ResponseFormat {
    let enabled = |name: &str| headers.get(name).is_some_and(|value| value == "true");
    let accepts = |media_type: &str| {
        headers
            .get(header::ACCEPT)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains(media_type))
    };
    // HTMX restores history with a GET, and Axum routes HEAD through the GET
    // handler, so both share navigation metadata. Mutations never enter browser
    // history and keep returning fragments or JSON for their existing callers.
    let navigation = method == Method::GET || method == Method::HEAD;
    let representation = if navigation {
        if enabled("hx-history-restore-request") {
            Representation::Page
        } else if enabled("hx-request") {
            Representation::Html
        } else if accepts("application/json") {
            Representation::Json
        } else {
            Representation::Page
        }
    } else if enabled("hx-request") || accepts("text/html") {
        Representation::Html
    } else {
        Representation::Json
    };
    ResponseFormat {
        representation,
        vary: if navigation { PAGE_VARY } else { API_VARY },
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
        let response = match self.representation {
            Representation::Page | Representation::Html => html.await?.into_response(),
            Representation::Json => Json(json).into_response(),
        };
        Ok(([(header::VARY, self.vary)], response).into_response())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        http::StatusCode,
        routing::{get, post},
    };
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

    async fn navigation_handler(format: ResponseFormat) -> Response {
        let representation = format.representation();
        format
            .respond(&Input { count: 3 }, async move {
                Ok::<_, StatusCode>(Html(match representation {
                    Representation::Html => "<p>fragment</p>".to_string(),
                    Representation::Page | Representation::Json => "<html>page</html>".to_string(),
                }))
            })
            .await
            .unwrap()
    }

    async fn json_only_handler(
        format: ResponseFormat,
        FormOrJson(input): FormOrJson<Input>,
    ) -> Response {
        format
            .respond(
                &input,
                std::future::ready(Err::<Html<String>, _>(StatusCode::INTERNAL_SERVER_ERROR)),
            )
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
    async fn navigation_returns_pages_fragments_and_json_by_request() {
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
                    Request::builder().uri("/").method("GET"),
                    |request, (name, value)| request.header(*name, *value),
                )
                .body(Body::empty())
                .unwrap();
            let response = Router::new()
                .route("/", get(navigation_handler))
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
    async fn head_navigation_advertises_the_get_representation() {
        let response = Router::new()
            .route("/", get(navigation_handler))
            .oneshot(
                Request::builder()
                    .method("HEAD")
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(
            response.headers()[header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .starts_with("text/html")
        );
        assert_eq!(
            response.headers()[header::VARY],
            "HX-Request, HX-History-Restore-Request, Accept"
        );
    }

    #[test]
    fn history_restore_always_selects_the_page_representation() {
        for headers in [
            vec![("hx-history-restore-request", "true")],
            vec![
                ("hx-history-restore-request", "true"),
                ("hx-request", "true"),
            ],
            vec![
                ("hx-history-restore-request", "true"),
                ("hx-request", "true"),
                ("accept", "application/json"),
            ],
        ] {
            let headers = headers
                .into_iter()
                .fold(HeaderMap::new(), |mut map, (name, value)| {
                    map.append(name, value.parse().unwrap());
                    map
                });
            assert_eq!(
                select_representation(&Method::GET, &headers).representation(),
                Representation::Page
            );
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
        let response = Router::new()
            .route("/", post(json_only_handler))
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"count":3}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
        assert_eq!(response.headers()[header::VARY], "HX-Request, Accept");
    }
}
