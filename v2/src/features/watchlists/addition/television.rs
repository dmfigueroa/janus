//! Television and episode addition.
//!
//! The dispatch is exhaustive. Expansion itself lands in the next unit, so
//! these functions do not call TMDB and do not write rows.

use crate::integrations::tmdb::TmdbCatalog;

use super::request::InsertionIntent;
use super::{WatchlistWriteResult, Watchlists, WriteFailure};

pub(super) async fn add_show(
    _lists: &Watchlists,
    _catalog: &dyn TmdbCatalog,
    _watchlist_id: i64,
    _show_id: u64,
    _title: &str,
    _insertion: &InsertionIntent,
) -> WatchlistWriteResult {
    unavailable()
}

pub(super) async fn add_episode(
    _lists: &Watchlists,
    _catalog: &dyn TmdbCatalog,
    _watchlist_id: i64,
    _episode_id: u64,
    _show_id: u64,
    _show_title: Option<&str>,
    _insertion: &InsertionIntent,
) -> WatchlistWriteResult {
    unavailable()
}

fn unavailable() -> WatchlistWriteResult {
    WatchlistWriteResult::failed(
        WriteFailure::Unsupported,
        "Television expansion is not available yet.",
    )
}
