//! Private SQLite mechanics for watchlist reads: statements, row decoding and
//! focused queries. Feature operations own transactions and compose the
//! resulting typed rows.

use sea_orm::{ConnectionTrait, DbBackend, DbErr, QueryResult, Statement};
use std::collections::HashMap;

use super::ItemOrderMode;
use super::snapshot::{WatchlistItem, WatchlistRecord};

/// Stored item counts read without loading item rows.
#[derive(Clone, Copy)]
pub(super) struct ItemCounts {
    pub total_items: usize,
    pub watched_items: usize,
}

/// The cover and next unwatched item selected for one summary.
pub(super) struct SelectedSummary {
    pub next_unwatched: Option<WatchlistItem>,
    pub cover_item: WatchlistItem,
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

/// Reads stored total and watched counts for the given watchlists that have
/// items.
pub(super) async fn counts_for<C: ConnectionTrait>(
    database: &C,
    watchlist_ids: &[i64],
) -> Result<HashMap<i64, ItemCounts>, DbErr> {
    if watchlist_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = vec!["?"; watchlist_ids.len()].join(",");
    let values = watchlist_ids.iter().map(|id| (*id).into()).collect();
    database
        .query_all_raw(statement(
            &format!(
                "SELECT watchlist_id, count(*) AS total,\
                 sum(CASE WHEN is_watched THEN 1 ELSE 0 END) AS watched \
                 FROM watchlist_items WHERE watchlist_id IN ({placeholders}) \
                 GROUP BY watchlist_id"
            ),
            values,
        ))
        .await?
        .iter()
        .map(|row| {
            Ok((
                row.try_get("", "watchlist_id")?,
                ItemCounts {
                    total_items: row.try_get::<i64>("", "total")? as usize,
                    watched_items: row.try_get::<Option<i64>>("", "watched")?.unwrap_or(0) as usize,
                },
            ))
        })
        .collect()
}

/// Selects the cover and next unwatched item for several watchlists of one
/// order mode without loading their complete item lists.
pub(super) async fn summary_selections<C: ConnectionTrait>(
    database: &C,
    watchlist_ids: &[i64],
    mode: ItemOrderMode,
) -> Result<HashMap<i64, SelectedSummary>, DbErr> {
    if watchlist_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = vec!["?"; watchlist_ids.len()].join(",");
    let order = mode.order_sql();
    // `COALESCE(is_watched,0)=0` must stay equivalent to `WatchlistItem::is_unwatched`.
    let sql = format!(
        "SELECT * FROM (\
           SELECT watchlist_items.*,\
             row_number() OVER (\
               PARTITION BY watchlist_id ORDER BY COALESCE(is_watched,0)=1, {order}\
             ) AS cover_rank,\
             row_number() OVER (\
               PARTITION BY watchlist_id, COALESCE(is_watched,0)=1 ORDER BY {order}\
             ) AS unwatched_rank \
           FROM watchlist_items WHERE watchlist_id IN ({placeholders})\
         ) WHERE cover_rank=1 OR (COALESCE(is_watched,0)=0 AND unwatched_rank=1)"
    );
    let values = watchlist_ids.iter().map(|id| (*id).into()).collect();
    let selected = database
        .query_all_raw(statement(&sql, values))
        .await?
        .iter()
        .try_fold(HashMap::<i64, SelectedItems>::new(), |mut selected, row| {
            let id = row.try_get::<i64>("", "watchlist_id")?;
            let cover_rank = row.try_get::<i64>("", "cover_rank")?;
            let unwatched_rank = row.try_get::<i64>("", "unwatched_rank")?;
            let entry = selected.entry(id).or_default();
            let item = item(row)?;
            if cover_rank == 1 {
                entry.cover_item = Some(item.clone());
            }
            if unwatched_rank == 1 && item.is_unwatched() {
                entry.next_unwatched = Some(item);
            }
            Ok::<_, DbErr>(selected)
        })?;
    Ok(selected
        .into_iter()
        .filter_map(|(id, selected)| {
            selected.cover_item.map(|cover_item| {
                (
                    id,
                    SelectedSummary {
                        next_unwatched: selected.next_unwatched,
                        cover_item,
                    },
                )
            })
        })
        .collect())
}

#[derive(Default)]
struct SelectedItems {
    cover_item: Option<WatchlistItem>,
    next_unwatched: Option<WatchlistItem>,
}

pub(super) fn record(row: &QueryResult) -> Result<WatchlistRecord, DbErr> {
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
