//! Feature-owned watchlist read snapshots.
//!
//! Typed watchlist records, stored items and their consistent detail snapshot
//! are composed here from private SQLite mechanics and derived summary rules.
//! Web and MCP adapters consume these types rather than coordinating queries.

use super::ItemOrderMode;
use super::Watchlists;
use super::storage;
use super::summary::{self, SummarySelection, WatchlistSummary};
use sea_orm::{DbErr, TransactionTrait};
use sha2::{Digest, Sha256};

/// One watchlist row without derived statistics.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchlistRecord {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub item_order_mode: ItemOrderMode,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub last_watched_at: Option<String>,
    pub last_item_added_at: Option<String>,
    pub paused_at: Option<String>,
}

/// One stored watchlist item with nullable watched state and metadata decoded.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchlistItem {
    pub id: i64,
    pub watchlist_id: i64,
    pub tmdb_id: String,
    pub source: String,
    pub media_type: String,
    pub title: String,
    pub parent_id: Option<String>,
    pub parent_title: Option<String>,
    pub season: Option<i64>,
    pub episode: Option<String>,
    pub poster_path: Option<String>,
    pub release_date: Option<String>,
    pub vote_average: Option<f64>,
    pub runtime: Option<i64>,
    pub custom_rank: Option<i64>,
    pub is_watched: Option<bool>,
    pub authors: Option<Vec<String>>,
    pub added_at: String,
}

impl WatchlistItem {
    /// Whether this item is still waiting to be watched. Nullable watched state
    /// counts as unwatched.
    pub fn is_unwatched(&self) -> bool {
        self.is_watched != Some(true)
    }

    /// Matches the item's title, parent title or episode against a lowercase query.
    pub fn matches_text(&self, lowercase_query: &str) -> bool {
        [self.title.as_str()]
            .into_iter()
            .chain(self.parent_title.as_deref())
            .chain(self.episode.as_deref())
            .any(|value| value.to_ascii_lowercase().contains(lowercase_query))
    }

    /// The parent identity and title, falling back to the item's own identity.
    pub fn group_title(&self) -> (&str, &str) {
        let id = self.parent_id.as_deref().unwrap_or(&self.tmdb_id);
        let title = self.parent_title.as_deref().unwrap_or(&self.title);
        (id, title)
    }
}

/// SQL equivalent of [`WatchlistItem::is_unwatched`] for stored reads.
pub(super) const UNWATCHED_ITEM_SQL: &str = "COALESCE(is_watched,0)=0";

/// A consistent watchlist snapshot: summary, ordered items and order token.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchlistDetail {
    pub watchlist: WatchlistSummary,
    pub items: Vec<WatchlistItem>,
    pub order_token: String,
}

impl Watchlists {
    /// Reads one watchlist, its items in stored order and its order token from
    /// a single transaction.
    ///
    /// # Errors
    ///
    /// Returns [`DbErr`] when the database read or stored-value decoding fails.
    pub async fn detail(&self, id: i64) -> Result<Option<WatchlistDetail>, DbErr> {
        let transaction = self.0.begin().await?;
        let Some(watchlist) = storage::watchlist(&transaction, id).await? else {
            return Ok(None);
        };
        let mode = watchlist.item_order_mode;
        let items = storage::items(&transaction, id, mode).await?;
        transaction.commit().await?;
        let stats = summary::stats_from_items(&items);
        let order_token = order_token(id, mode, &items);
        Ok(Some(WatchlistDetail {
            watchlist: WatchlistSummary { watchlist, stats },
            items,
            order_token,
        }))
    }

    /// Reads every watchlist row without derived statistics.
    ///
    /// # Errors
    ///
    /// Returns [`DbErr`] when the database read or stored-value decoding fails.
    pub async fn headers(&self) -> Result<Vec<WatchlistRecord>, DbErr> {
        storage::headers(&self.0).await
    }

    /// Reads one summary without loading every item.
    ///
    /// # Errors
    ///
    /// Returns [`DbErr`] when the database read or stored-value decoding fails.
    pub(super) async fn summary(&self, id: i64) -> Result<Option<WatchlistSummary>, DbErr> {
        let transaction = self.0.begin().await?;
        let Some(watchlist) = storage::watchlist(&transaction, id).await? else {
            return Ok(None);
        };
        let mode = watchlist.item_order_mode;
        let counts = storage::counts(&transaction, id).await?;
        let next_unwatched = storage::first_item(&transaction, id, mode, true).await?;
        let first_item = if next_unwatched.is_some() {
            None
        } else {
            storage::first_item(&transaction, id, mode, false).await?
        };
        transaction.commit().await?;
        let stats = summary::build_stats(
            counts.total_items,
            counts.watched_items,
            SummarySelection::new(next_unwatched, first_item),
        );
        Ok(Some(WatchlistSummary { watchlist, stats }))
    }
}

fn order_token(id: i64, mode: ItemOrderMode, items: &[WatchlistItem]) -> String {
    let ids = items
        .iter()
        .map(|item| item.id.to_string())
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "sha256:{:x}",
        Sha256::digest(format!("{id}:{}:{ids}", mode.as_str()))
    )
}
