//! Live TMDB transport. Retries match v1's provider policy: two extra attempts
//! for transport failures and the transient HTTP statuses, with a 5s request
//! timeout and a 20s budget.

use super::{BoxFuture, TmdbFailure, TmdbTransport};
use serde_json::Value;
use std::time::{Duration, Instant};

const ATTEMPTS: u32 = 3;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const TOTAL_BUDGET: Duration = Duration::from_secs(20);
const RETRY_STATUS: &[u16] = &[408, 429, 500, 502, 503, 504];

#[derive(Clone)]
pub struct LiveTransport {
    client: reqwest::Client,
}

impl LiveTransport {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("TMDB HTTP client accepts a static timeout");
        Self { client }
    }

    async fn once(&self, url: &str, api_key: &str) -> Result<Value, Attempt> {
        let response = self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|_| Attempt::Transient)?;
        let status = response.status().as_u16();
        if response.status().is_success() {
            return response.json().await.map_err(|_| Attempt::Permanent);
        }
        if RETRY_STATUS.contains(&status) {
            Err(Attempt::Transient)
        } else {
            Err(Attempt::Permanent)
        }
    }
}

impl Default for LiveTransport {
    fn default() -> Self {
        Self::new()
    }
}

enum Attempt {
    Transient,
    Permanent,
}

impl TmdbTransport for LiveTransport {
    fn get_json<'a>(
        &'a self,
        url: &'a str,
        api_key: &'a str,
    ) -> BoxFuture<'a, Result<Value, TmdbFailure>> {
        Box::pin(async move {
            let started = Instant::now();
            let mut attempt = 0;
            loop {
                attempt += 1;
                match self.once(url, api_key).await {
                    Ok(body) => return Ok(body),
                    Err(Attempt::Permanent) => return Err(TmdbFailure::Unavailable),
                    Err(Attempt::Transient)
                        if attempt >= ATTEMPTS || started.elapsed() >= TOTAL_BUDGET =>
                    {
                        return Err(TmdbFailure::Unavailable);
                    }
                    Err(Attempt::Transient) => {
                        tokio::time::sleep(Duration::from_millis(200 * u64::from(attempt))).await;
                    }
                }
            }
        })
    }
}
