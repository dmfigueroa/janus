use askama::Template;
use axum::{http::StatusCode, response::Html};

#[derive(Template)]
#[template(path = "smoke.html")]
struct SmokePage;

pub async fn page() -> Result<Html<String>, (StatusCode, &'static str)> {
    SmokePage.render().map(Html).map_err(|error| {
        eprintln!("Smoke template failed: {error}");
        (StatusCode::INTERNAL_SERVER_ERROR, "Unable to render page")
    })
}
