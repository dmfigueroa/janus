//! Feature-owned watchlist read data: stored-row decoding and the domain
//! interpretation both web and MCP adapters consume.

use super::Watchlists;
use sea_orm::{ConnectionTrait, DbBackend, DbErr, QueryResult, Statement, TransactionTrait};
use sha2::{Digest, Sha256};

fn statement(sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}

fn text(row: &QueryResult, column: &str) -> Result<Option<String>, DbErr> {
    row.try_get("", column)
}

/// Stored `item_order_mode`, validated at startup to be one of two values.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemOrderMode {
    Release,
    Custom,
}

impl ItemOrderMode {
    /// Decodes a stored `item_order_mode` value.
    ///
    /// # Errors
    ///
    /// Returns [`DbErr`] when the stored text is neither `release` nor `custom`.
    fn from_stored(value: &str) -> Result<Self, DbErr> {
        match value {
            "release" => Ok(Self::Release),
            "custom" => Ok(Self::Custom),
            unknown => Err(DbErr::Custom(format!(
                "Unsupported watchlist item order mode: {unknown}"
            ))),
        }
    }

    /// The stored value for this mode.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Release => "release",
            Self::Custom => "custom",
        }
    }

    /// The `ORDER BY` expression for this mode's stored item order.
    pub(super) fn order_sql(self) -> String {
        let prefix = if self == Self::Custom {
            "custom_rank IS NULL,custom_rank,"
        } else {
            ""
        };
        format!(
            "{prefix} CASE WHEN release_date IS NULL OR release_date='' THEN 1 ELSE 0 END,release_date,id"
        )
    }
}

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

/// Derived counts, progress, next unwatched item and cover metadata.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchlistStats {
    pub total_items: usize,
    pub watched_items: usize,
    pub progress: u64,
    pub next_unwatched: Option<WatchlistItem>,
    pub cover_image: Option<String>,
    pub cover_media_type: Option<String>,
}

/// A watchlist row plus its derived statistics.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchlistSummary {
    pub watchlist: WatchlistRecord,
    pub stats: WatchlistStats,
}

/// A consistent watchlist snapshot: summary, ordered items and order token.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchlistDetail {
    pub watchlist: WatchlistSummary,
    pub items: Vec<WatchlistItem>,
    pub order_token: String,
}

fn watchlist_record(row: &QueryResult) -> Result<WatchlistRecord, DbErr> {
    Ok(WatchlistRecord {
        id: row.try_get("", "id")?,
        name: row.try_get("", "name")?,
        description: text(row, "description")?,
        item_order_mode: ItemOrderMode::from_stored(
            &row.try_get::<String>("", "item_order_mode")?,
        )?,
        created_at: row.try_get("", "created_at")?,
        updated_at: text(row, "updated_at")?,
        last_watched_at: text(row, "last_watched_at")?,
        last_item_added_at: text(row, "last_item_added_at")?,
        paused_at: text(row, "paused_at")?,
    })
}

fn watchlist_item(row: &QueryResult) -> Result<WatchlistItem, DbErr> {
    let authors = match text(row, "authors")? {
        Some(value) => {
            Some(serde_json::from_str(&value).map_err(|error| DbErr::Custom(error.to_string()))?)
        }
        None => None,
    };
    Ok(WatchlistItem {
        id: row.try_get("", "id")?,
        watchlist_id: row.try_get("", "watchlist_id")?,
        tmdb_id: row.try_get("", "tmdb_id")?,
        source: row.try_get("", "source")?,
        media_type: row.try_get("", "media_type")?,
        title: row.try_get("", "title")?,
        parent_id: text(row, "parent_id")?,
        parent_title: text(row, "parent_title")?,
        season: row.try_get("", "season")?,
        episode: text(row, "episode")?,
        poster_path: text(row, "poster_path")?,
        release_date: text(row, "release_date")?,
        vote_average: row.try_get("", "vote_average")?,
        runtime: row.try_get("", "runtime")?,
        custom_rank: row.try_get("", "custom_rank")?,
        is_watched: row.try_get("", "is_watched")?,
        authors,
        added_at: row.try_get("", "added_at")?,
    })
}

fn watchlist_stats(
    total_items: usize,
    watched_items: usize,
    next_unwatched: Option<&WatchlistItem>,
    cover: Option<&WatchlistItem>,
) -> WatchlistStats {
    let progress = if total_items == 0 {
        0
    } else if total_items == watched_items {
        100
    } else {
        let percentage = (watched_items as f64 / total_items as f64 * 100.0).round();
        // Completed lists report 100 above; partial lists stay below it.
        percentage.min(99.0) as u64
    };
    WatchlistStats {
        total_items,
        watched_items,
        progress,
        next_unwatched: next_unwatched.cloned(),
        cover_image: cover.and_then(|item| item.poster_path.clone()),
        cover_media_type: cover.map(|item| item.media_type.clone()),
    }
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
        let Some(row) = transaction
            .query_one_raw(statement(
                "SELECT * FROM watchlists WHERE id = ?",
                vec![id.into()],
            ))
            .await?
        else {
            return Ok(None);
        };
        let watchlist = watchlist_record(&row)?;
        let mode = watchlist.item_order_mode;
        let sql = format!(
            "SELECT * FROM watchlist_items WHERE watchlist_id=? ORDER BY {}",
            mode.order_sql()
        );
        let items: Vec<WatchlistItem> = transaction
            .query_all_raw(statement(&sql, vec![id.into()]))
            .await?
            .iter()
            .map(watchlist_item)
            .collect::<Result<_, _>>()?;
        transaction.commit().await?;
        let watched_items = items
            .iter()
            .filter(|item| item.is_watched == Some(true))
            .count();
        let next_unwatched = items.iter().find(|item| item.is_watched != Some(true));
        let cover = next_unwatched.or_else(|| items.first());
        let order_token = order_token(id, mode, &items);
        Ok(Some(WatchlistDetail {
            watchlist: WatchlistSummary {
                stats: watchlist_stats(items.len(), watched_items, next_unwatched, cover),
                watchlist,
            },
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
        self.0
            .query_all_raw(statement("SELECT * FROM watchlists", vec![]))
            .await?
            .iter()
            .map(watchlist_record)
            .collect()
    }

    pub(super) async fn summary(&self, id: i64) -> Result<Option<WatchlistSummary>, DbErr> {
        let transaction = self.0.begin().await?;
        let Some(row) = transaction
            .query_one_raw(statement(
                "SELECT * FROM watchlists WHERE id=?",
                vec![id.into()],
            ))
            .await?
        else {
            return Ok(None);
        };
        let watchlist = watchlist_record(&row)?;
        let ordering = watchlist.item_order_mode.order_sql();
        let counts = transaction
            .query_one_raw(statement(
                "SELECT count(*) AS total,\
                 sum(CASE WHEN is_watched THEN 1 ELSE 0 END) AS watched \
                 FROM watchlist_items WHERE watchlist_id=?",
                vec![id.into()],
            ))
            .await?
            .ok_or_else(|| DbErr::Custom("Missing watchlist item counts".to_owned()))?;
        let total = counts.try_get::<i64>("", "total")? as usize;
        let watched_items = counts.try_get::<Option<i64>>("", "watched")?.unwrap_or(0) as usize;
        let next_unwatched = transaction
            .query_one_raw(statement(
                &format!(
                    "SELECT * FROM watchlist_items \
                     WHERE watchlist_id=? AND COALESCE(is_watched,0)=0 \
                     ORDER BY {ordering} LIMIT 1"
                ),
                vec![id.into()],
            ))
            .await?
            .as_ref()
            .map(watchlist_item)
            .transpose()?;
        let cover = if next_unwatched.is_some() {
            None
        } else {
            transaction
                .query_one_raw(statement(
                    &format!(
                        "SELECT * FROM watchlist_items WHERE watchlist_id=? \
                         ORDER BY {ordering} LIMIT 1"
                    ),
                    vec![id.into()],
                ))
                .await?
                .as_ref()
                .map(watchlist_item)
                .transpose()?
        };
        transaction.commit().await?;
        Ok(Some(WatchlistSummary {
            stats: watchlist_stats(
                total,
                watched_items,
                next_unwatched.as_ref(),
                next_unwatched.as_ref().or(cover.as_ref()),
            ),
            watchlist,
        }))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_order_mode_decodes_release_and_custom() {
        assert_eq!(
            ItemOrderMode::from_stored("release").unwrap(),
            ItemOrderMode::Release
        );
        assert_eq!(
            ItemOrderMode::from_stored("custom").unwrap(),
            ItemOrderMode::Custom
        );
    }

    #[test]
    fn item_order_mode_rejects_unknown_stored_values() {
        let error = ItemOrderMode::from_stored("sideways").unwrap_err();
        assert!(
            error
                .to_string()
                .contains("Unsupported watchlist item order mode: sideways"),
            "{error}"
        );
    }
}
