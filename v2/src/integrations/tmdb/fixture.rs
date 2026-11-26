//! Scripted TMDB HTTP for tests. Matching is by URL substring.

use super::{BoxFuture, TmdbFailure, TmdbTransport};
use serde_json::Value;
use std::sync::{Arc, Mutex};

/// One canned response. The first route whose substring is in the URL wins.
#[derive(Clone)]
pub struct FixtureRoute {
    pub path_contains: String,
    pub body: FixtureBody,
}

/// A successful JSON document or a transport failure.
#[derive(Clone)]
pub enum FixtureBody {
    Json(Value),
    Unavailable,
}

/// One observed request, including the bearer key the client presented.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FixtureCall {
    pub url: String,
    pub api_key: String,
}

/// In-memory transport. Clone shares the call log.
#[derive(Clone, Default)]
pub struct FixtureTransport {
    routes: Arc<Vec<FixtureRoute>>,
    calls: Arc<Mutex<Vec<FixtureCall>>>,
}

impl FixtureTransport {
    pub fn new(routes: Vec<FixtureRoute>) -> Self {
        Self {
            routes: Arc::new(routes),
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn calls(&self) -> Vec<FixtureCall> {
        self.calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

impl TmdbTransport for FixtureTransport {
    fn get_json<'a>(
        &'a self,
        url: &'a str,
        api_key: &'a str,
    ) -> BoxFuture<'a, Result<Value, TmdbFailure>> {
        Box::pin(async move {
            self.calls
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(FixtureCall {
                    url: url.to_owned(),
                    api_key: api_key.to_owned(),
                });
            let route = self
                .routes
                .iter()
                .find(|route| url.contains(&route.path_contains));
            match route.map(|route| &route.body) {
                Some(FixtureBody::Json(body)) => Ok(body.clone()),
                Some(FixtureBody::Unavailable) | None => Err(TmdbFailure::Unavailable),
            }
        })
    }
}
