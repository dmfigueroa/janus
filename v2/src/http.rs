//! Shared browser/API transport policy. Feature handlers own their representations.
use axum::{
    Form, Json,
    extract::{FromRequest, FromRequestParts, Request},
    http::{header, request::Parts},
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

/// HTMX and explicit HTML requests receive HTML; existing API callers default to JSON.
#[derive(Clone, Copy)]
pub enum ResponseFormat {
    Html,
    Json,
}

impl<S: Send + Sync> FromRequestParts<S> for ResponseFormat {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let htmx = parts
            .headers
            .get("hx-request")
            .is_some_and(|value| value == "true");
        let html = parts
            .headers
            .get(header::ACCEPT)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("text/html"));
        Ok(if htmx || html { Self::Html } else { Self::Json })
    }
}

impl ResponseFormat {
    /// Evaluate HTML rendering only when requested, preserving the cheaper API path.
    pub async fn respond<T, E>(
        self,
        json: T,
        html: impl Future<Output = Result<Html<String>, E>>,
    ) -> Result<Response, E>
    where
        T: Serialize,
    {
        let response = match self {
            Self::Html => html.await?.into_response(),
            Self::Json => Json(json).into_response(),
        };
        Ok(([(header::VARY, "HX-Request, Accept")], response).into_response())
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

    #[tokio::test]
    async fn formats_are_independent_of_body_encoding() {
        for (content_type, body) in [
            ("application/json", r#"{"count":3}"#),
            ("application/x-www-form-urlencoded", "count=3"),
        ] {
            for (header_name, header_value, expected) in [
                ("accept", "application/json", r#"{"count":3}"#),
                ("accept", "text/html", "<p>3</p>"),
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
