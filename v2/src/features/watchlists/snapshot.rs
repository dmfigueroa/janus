//! Feature-owned watchlist read snapshots.
//!
//! Typed watchlist records, stored items and their consistent detail snapshot
//! are composed here from private SQLite mechanics and derived summary rules.
//! Web and MCP adapters consume these types rather than coordinating queries.

use sea_orm::{ConnectionTrait, DbErr, TransactionTrait};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

use super::ItemOrderMode;
use super::Watchlists;
use super::storage;
use super::summary::{self, SummarySelection, WatchlistSummary};

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

    /// Reads every watchlist summary in one consistent snapshot.
    ///
    /// # Errors
    ///
    /// Returns [`DbErr`] when a database read or stored-value decoding fails.
    pub async fn all_summaries(&self) -> Result<Vec<WatchlistSummary>, DbErr> {
        let (summaries, ()) = self
            .summaries_for(|headers| {
                let ids = headers.iter().map(|header| header.id).collect();
                (ids, ())
            })
            .await?;
        Ok(summaries)
    }

    /// Reads the summaries chosen by `select` from one consistent snapshot.
    ///
    /// `select` receives every stored watchlist header, applies the caller's
    /// selection policy and returns the chosen identifiers in result order
    /// alongside a caller-owned value. Headers, counts and cover selections for
    /// those identifiers are then read inside one transaction, so a page never
    /// mixes states from different writes.
    ///
    /// # Errors
    ///
    /// Returns [`DbErr`] when a database read or stored-value decoding fails.
    pub(super) async fn summaries_for<T, F>(
        &self,
        select: F,
    ) -> Result<(Vec<WatchlistSummary>, T), DbErr>
    where
        F: FnOnce(&[WatchlistRecord]) -> (Vec<i64>, T),
    {
        let transaction = self.0.begin().await?;
        let headers = storage::headers(&transaction).await?;
        let (ids, selected) = select(&headers);
        let summaries = hydrate(&transaction, headers, &ids).await?;
        transaction.commit().await?;
        Ok((summaries, selected))
    }
}

/// Hydrates the selected watchlists from already read headers, their stored
/// counts and one cover selection per order mode.
async fn hydrate<C: ConnectionTrait>(
    database: &C,
    headers: Vec<WatchlistRecord>,
    ids: &[i64],
) -> Result<Vec<WatchlistSummary>, DbErr> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut headers_by_id = headers
        .into_iter()
        .map(|header| (header.id, header))
        .collect::<HashMap<_, _>>();
    let counts = storage::counts_for(database, ids).await?;
    let mut selections = HashMap::new();
    for mode in [ItemOrderMode::Release, ItemOrderMode::Custom] {
        let mode_ids = ids
            .iter()
            .filter(|id| {
                headers_by_id
                    .get(id)
                    .is_some_and(|header| header.item_order_mode == mode)
            })
            .copied()
            .collect::<Vec<_>>();
        selections.extend(storage::summary_selections(database, &mode_ids, mode).await?);
    }
    Ok(ids
        .iter()
        .filter_map(|id| {
            let header = headers_by_id.remove(id)?;
            let counts = counts.get(id).copied().unwrap_or(storage::ItemCounts {
                total_items: 0,
                watched_items: 0,
            });
            let selection = selections.remove(id).map(|selected| {
                let storage::SelectedSummary {
                    next_unwatched,
                    cover_item,
                } = selected;
                SummarySelection::new(next_unwatched, Some(&cover_item))
            });
            Some(WatchlistSummary {
                watchlist: header,
                stats: summary::build_stats(
                    counts.total_items,
                    counts.watched_items,
                    selection.unwrap_or_else(|| SummarySelection::new(None, None)),
                ),
            })
        })
        .collect())
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
