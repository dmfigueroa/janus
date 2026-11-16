//! Private SQLite mechanics for watchlist reads: statements, row decoding and
//! focused queries. Feature operations own transactions and compose the
//! resulting typed rows.

use sea_orm::{ConnectionTrait, DbBackend, DbErr, QueryResult, Statement};

use super::ItemOrderMode;
use super::snapshot::{UNWATCHED_ITEM_SQL, WatchlistItem, WatchlistRecord};

/// Stored item counts read without loading item rows.
pub(super) struct ItemCounts {
    pub total_items: usize,
    pub watched_items: usize,
}

fn statement(sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}

fn text(row: &QueryResult, column: &str) -> Result<Option<String>, DbErr> {
    row.try_get("", column)
}

/// Reads and decodes one watchlist row.
pub(super) async fn watchlist<C: ConnectionTrait>(
    database: &C,
    id: i64,
) -> Result<Option<WatchlistRecord>, DbErr> {
    database
        .query_one_raw(statement(
            "SELECT * FROM watchlists WHERE id = ?",
            vec![id.into()],
        ))
        .await?
        .as_ref()
        .map(record)
        .transpose()
}

/// Reads and decodes every watchlist row.
pub(super) async fn headers<C: ConnectionTrait>(
    database: &C,
) -> Result<Vec<WatchlistRecord>, DbErr> {
    database
        .query_all_raw(statement("SELECT * FROM watchlists", vec![]))
        .await?
        .iter()
        .map(record)
        .collect()
}

/// Reads one watchlist's items in its stored order.
pub(super) async fn items<C: ConnectionTrait>(
    database: &C,
    id: i64,
    mode: ItemOrderMode,
) -> Result<Vec<WatchlistItem>, DbErr> {
    database
        .query_all_raw(statement(
            &format!(
                "SELECT * FROM watchlist_items WHERE watchlist_id=? ORDER BY {}",
                mode.order_sql()
            ),
            vec![id.into()],
        ))
        .await?
        .iter()
        .map(item)
        .collect()
}

/// Reads stored total and watched counts for one watchlist.
pub(super) async fn counts<C: ConnectionTrait>(database: &C, id: i64) -> Result<ItemCounts, DbErr> {
    let row = database
        .query_one_raw(statement(
            "SELECT count(*) AS total,\
             sum(CASE WHEN is_watched THEN 1 ELSE 0 END) AS watched \
             FROM watchlist_items WHERE watchlist_id=?",
            vec![id.into()],
        ))
        .await?
        .ok_or_else(|| DbErr::Custom("Missing watchlist item counts".to_owned()))?;
    Ok(ItemCounts {
        total_items: row.try_get::<i64>("", "total")? as usize,
        watched_items: row.try_get::<Option<i64>>("", "watched")?.unwrap_or(0) as usize,
    })
}

/// Which stored items a first-item query considers.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ItemFilter {
    All,
    Unwatched,
}

/// Reads the first item in the watchlist's stored order matching the filter.
pub(super) async fn first_item<C: ConnectionTrait>(
    database: &C,
    id: i64,
    mode: ItemOrderMode,
    filter: ItemFilter,
) -> Result<Option<WatchlistItem>, DbErr> {
    let predicate = match filter {
        ItemFilter::All => String::new(),
        ItemFilter::Unwatched => format!(" AND {UNWATCHED_ITEM_SQL}"),
    };
    database
        .query_one_raw(statement(
            &format!(
                "SELECT * FROM watchlist_items WHERE watchlist_id=?{predicate} \
                 ORDER BY {} LIMIT 1",
                mode.order_sql()
            ),
            vec![id.into()],
        ))
        .await?
        .as_ref()
        .map(item)
        .transpose()
}

fn record(row: &QueryResult) -> Result<WatchlistRecord, DbErr> {
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

fn item(row: &QueryResult) -> Result<WatchlistItem, DbErr> {
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
