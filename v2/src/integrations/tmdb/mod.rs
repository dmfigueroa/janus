//! TMDB HTTP and the mapping from provider JSON into search and addition records.
//!
//! The live client reads `TMDB_API_KEY` on each call, matching v1. Tests inject
//! [`FixtureTransport`] so provider HTTP never leaves the process.

mod dto;
mod fixture;
mod http;

use std::{future::Future, pin::Pin};

pub use fixture::{FixtureBody, FixtureCall, FixtureRoute, FixtureTransport};
pub use http::LiveTransport;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Why a TMDB call did not return usable JSON.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TmdbFailure {
    /// `TMDB_API_KEY` is missing or empty.
    NotConfigured,
    /// The provider returned an error, timed out, or sent a body this client rejects.
    Unavailable,
}

impl std::fmt::Display for TmdbFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConfigured => write!(formatter, "TMDB is not configured"),
            Self::Unavailable => write!(formatter, "TMDB is unavailable"),
        }
    }
}

impl std::error::Error for TmdbFailure {}

/// Movie or television search, the only TMDB search kinds v1 exposes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TmdbKind {
    Movie,
    Tv,
}

impl TmdbKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Movie => "movie",
            Self::Tv => "tv",
        }
    }
}

/// One search hit after image URLs and year are derived.
#[derive(Clone, Debug, PartialEq)]
pub struct TmdbSearchHit {
    pub id: String,
    pub media_type: TmdbKind,
    pub title: String,
    pub poster: Option<String>,
    pub backdrop: Option<String>,
    pub year: Option<String>,
    pub release_date: Option<String>,
    pub rating: Option<f64>,
    pub overview: Option<String>,
}

/// A TMDB search page. `total_pages` is at least 1, matching v1's `|| 1`.
#[derive(Clone, Debug, PartialEq)]
pub struct TmdbSearchPage {
    pub hits: Vec<TmdbSearchHit>,
    pub total_pages: u32,
    pub total_results: u32,
}

/// Canonical movie fields persisted onto a watchlist item.
#[derive(Clone, Debug, PartialEq)]
pub struct TmdbMovie {
    pub title: String,
    pub poster_path: Option<String>,
    pub release_date: Option<String>,
    pub vote_average: Option<f64>,
    pub runtime: i64,
}

/// Show metadata plus every season number TMDB returned, including season 0.
#[derive(Clone, Debug, PartialEq)]
pub struct TmdbShow {
    pub name: Option<String>,
    pub poster_path: Option<String>,
    pub seasons: Vec<i64>,
}

/// One episode from a season payload.
#[derive(Clone, Debug, PartialEq)]
pub struct TmdbEpisode {
    pub id: String,
    pub name: String,
    pub season_number: i64,
    pub episode_number: i64,
    pub still_path: Option<String>,
    pub air_date: Option<String>,
    pub vote_average: f64,
    pub runtime: i64,
}

/// Fetches TMDB JSON. Implementations must be safe to call concurrently.
pub trait TmdbTransport: Send + Sync {
    fn get_json<'a>(
        &'a self,
        url: &'a str,
        api_key: &'a str,
    ) -> BoxFuture<'a, Result<serde_json::Value, TmdbFailure>>;
}

/// The operations search and addition call. HTTP stays behind this trait.
pub trait TmdbCatalog: Send + Sync {
    fn search<'a>(
        &'a self,
        kind: TmdbKind,
        query: &'a str,
        page: u32,
    ) -> BoxFuture<'a, Result<TmdbSearchPage, TmdbFailure>>;

    fn movie<'a>(&'a self, id: u64) -> BoxFuture<'a, Result<TmdbMovie, TmdbFailure>>;

    fn show<'a>(&'a self, id: u64) -> BoxFuture<'a, Result<TmdbShow, TmdbFailure>>;

    fn season<'a>(
        &'a self,
        id: u64,
        season_number: i64,
    ) -> BoxFuture<'a, Result<Vec<TmdbEpisode>, TmdbFailure>>;
}

#[derive(Clone)]
enum ApiKey {
    Environment,
    Fixed(Option<String>),
}

impl ApiKey {
    fn current(&self) -> Result<String, TmdbFailure> {
        let value = match self {
            Self::Environment => std::env::var("TMDB_API_KEY").ok(),
            Self::Fixed(value) => value.clone(),
        };
        value
            .filter(|key| !key.is_empty())
            .ok_or(TmdbFailure::NotConfigured)
    }
}

/// TMDB client over an injected transport.
#[derive(Clone)]
pub struct TmdbClient<T> {
    transport: T,
    api_key: ApiKey,
}

impl TmdbClient<LiveTransport> {
    /// Live client. The API key is read from the environment on every call.
    pub fn from_env() -> Self {
        Self {
            transport: LiveTransport::new(),
            api_key: ApiKey::Environment,
        }
    }
}

impl<T> TmdbClient<T> {
    /// Client that uses a fixed key. `None` or `""` is not configured.
    pub fn with_key(transport: T, api_key: Option<String>) -> Self {
        Self {
            transport,
            api_key: ApiKey::Fixed(api_key),
        }
    }
}

impl<T: TmdbTransport> TmdbCatalog for TmdbClient<T> {
    fn search<'a>(
        &'a self,
        kind: TmdbKind,
        query: &'a str,
        page: u32,
    ) -> BoxFuture<'a, Result<TmdbSearchPage, TmdbFailure>> {
        Box::pin(async move {
            let url = search_url(kind, query, page);
            let body = self.get(&url).await?;
            dto::parse_search(body, kind).map_err(|_| TmdbFailure::Unavailable)
        })
    }

    fn movie<'a>(&'a self, id: u64) -> BoxFuture<'a, Result<TmdbMovie, TmdbFailure>> {
        Box::pin(async move {
            let body = self.get(&resource_url(&format!("movie/{id}"))).await?;
            dto::parse_movie(body).map_err(|_| TmdbFailure::Unavailable)
        })
    }

    fn show<'a>(&'a self, id: u64) -> BoxFuture<'a, Result<TmdbShow, TmdbFailure>> {
        Box::pin(async move {
            let body = self.get(&resource_url(&format!("tv/{id}"))).await?;
            dto::parse_show(body).map_err(|_| TmdbFailure::Unavailable)
        })
    }

    fn season<'a>(
        &'a self,
        id: u64,
        season_number: i64,
    ) -> BoxFuture<'a, Result<Vec<TmdbEpisode>, TmdbFailure>> {
        Box::pin(async move {
            let body = self
                .get(&resource_url(&format!("tv/{id}/season/{season_number}")))
                .await?;
            dto::parse_season(body).map_err(|_| TmdbFailure::Unavailable)
        })
    }
}

impl<T: TmdbTransport> TmdbClient<T> {
    async fn get(&self, url: &str) -> Result<serde_json::Value, TmdbFailure> {
        let api_key = self.api_key.current()?;
        self.transport.get_json(url, &api_key).await
    }
}

fn search_url(kind: TmdbKind, query: &str, page: u32) -> String {
    let endpoint = match kind {
        TmdbKind::Movie => "search/movie",
        TmdbKind::Tv => "search/tv",
    };
    format!(
        "{}?query={}&page={page}&include_adult=false&language=en-US",
        resource_url(endpoint),
        encode_component(query),
    )
}

fn resource_url(path: &str) -> String {
    format!("https://api.themoviedb.org/3/{path}")
}

fn encode_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(char::from(byte));
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn movie_page() -> serde_json::Value {
        json!({
            "page": 1,
            "total_pages": 1,
            "total_results": 1,
            "results": [{
                "id": 550,
                "title": "Fight Club",
                "poster_path": "/fight-club.jpg",
                "backdrop_path": "/fight-club-backdrop.jpg",
                "release_date": "1999-10-15",
                "vote_average": 8.4,
                "overview": "An insomniac office worker forms an underground club."
            }]
        })
    }

    #[tokio::test]
    async fn fixture_maps_a_movie_search_hit() {
        let transport = FixtureTransport::new(vec![FixtureRoute {
            path_contains: "/search/movie".into(),
            body: FixtureBody::Json(movie_page()),
        }]);
        let client = TmdbClient::with_key(transport.clone(), Some("test-tmdb-key".into()));
        let page = client
            .search(TmdbKind::Movie, "Fight Club", 1)
            .await
            .unwrap();
        assert_eq!(page.total_pages, 1);
        assert_eq!(page.total_results, 1);
        assert_eq!(page.hits.len(), 1);
        let hit = &page.hits[0];
        assert_eq!(hit.id, "550");
        assert_eq!(hit.media_type, TmdbKind::Movie);
        assert_eq!(hit.title, "Fight Club");
        assert_eq!(hit.year.as_deref(), Some("1999"));
        assert_eq!(hit.release_date.as_deref(), Some("1999-10-15"));
        assert_eq!(
            hit.poster.as_deref(),
            Some("https://image.tmdb.org/t/p/w500/fight-club.jpg")
        );
        assert_eq!(
            hit.backdrop.as_deref(),
            Some("https://image.tmdb.org/t/p/w1280/fight-club-backdrop.jpg")
        );
        let calls = transport.calls();
        assert_eq!(calls.len(), 1);
        assert!(calls[0].url.contains("/search/movie"));
        assert!(calls[0].url.contains("query=Fight%20Club"));
        assert!(calls[0].url.contains("include_adult=false"));
        assert_eq!(calls[0].api_key, "test-tmdb-key");
    }

    #[tokio::test]
    async fn missing_key_does_not_call_the_transport() {
        let transport = FixtureTransport::new(vec![FixtureRoute {
            path_contains: "/search/movie".into(),
            body: FixtureBody::Json(movie_page()),
        }]);
        let client = TmdbClient::with_key(transport.clone(), None);
        let error = client
            .search(TmdbKind::Movie, "Fight Club", 1)
            .await
            .unwrap_err();
        assert_eq!(error, TmdbFailure::NotConfigured);
        assert!(transport.calls().is_empty());
    }

    #[tokio::test]
    async fn malformed_search_json_is_unavailable() {
        let transport = FixtureTransport::new(vec![FixtureRoute {
            path_contains: "/search/tv".into(),
            body: FixtureBody::Json(json!({"invalid": true})),
        }]);
        let client = TmdbClient::with_key(transport, Some("key".into()));
        let error = client.search(TmdbKind::Tv, "show", 1).await.unwrap_err();
        assert_eq!(error, TmdbFailure::Unavailable);
    }

    #[tokio::test]
    async fn transport_failure_is_unavailable() {
        let transport = FixtureTransport::new(vec![FixtureRoute {
            path_contains: "/movie/".into(),
            body: FixtureBody::Unavailable,
        }]);
        let client = TmdbClient::with_key(transport, Some("key".into()));
        let error = client.movie(550).await.unwrap_err();
        assert_eq!(error, TmdbFailure::Unavailable);
    }

    #[tokio::test]
    async fn movie_and_season_payloads_keep_provider_paths() {
        let transport = FixtureTransport::new(vec![
            FixtureRoute {
                path_contains: "/movie/550".into(),
                body: FixtureBody::Json(json!({
                    "title": "Fight Club",
                    "poster_path": "/fight-club.jpg",
                    "release_date": "1999-10-15",
                    "vote_average": 8.4,
                    "runtime": 139
                })),
            },
            FixtureRoute {
                path_contains: "/tv/1399/season/1".into(),
                body: FixtureBody::Json(json!({
                    "episodes": [{
                        "id": 1002,
                        "name": "Second",
                        "season_number": 1,
                        "episode_number": 2,
                        "still_path": null,
                        "air_date": "2011-04-24",
                        "vote_average": 8.1,
                        "runtime": 60
                    }]
                })),
            },
        ]);
        let client = TmdbClient::with_key(transport, Some("key".into()));
        let movie = client.movie(550).await.unwrap();
        assert_eq!(movie.title, "Fight Club");
        assert_eq!(movie.poster_path.as_deref(), Some("/fight-club.jpg"));
        assert_eq!(movie.runtime, 139);
        let episodes = client.season(1399, 1).await.unwrap();
        assert_eq!(episodes[0].id, "1002");
        assert_eq!(episodes[0].still_path, None);
        assert_eq!(episodes[0].runtime, 60);
    }
}
