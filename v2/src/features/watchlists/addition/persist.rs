//! SQLite writes for added watchlist items.
//!
//! Callers finish provider HTTP before [`persist_items`]. The write transaction
//! re-reads the destination and does not span a network call.

use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement, TransactionTrait};

use super::super::{ItemOrderMode, Watchlists};
use super::destination::{DestinationFailure, InsertionPosition, validate_addition_destination};
use super::order::{CustomOrderPlan, PendingInsert, StoredOrderItem, plan_custom_order};
use super::request::InsertionIntent;

pub(super) struct NewItem {
    pub(super) tmdb_id: String,
    pub(super) source: &'static str,
    pub(super) media_type: &'static str,
    pub(super) title: String,
    pub(super) parent_id: Option<String>,
    pub(super) parent_title: Option<String>,
    pub(super) season: Option<i64>,
    pub(super) episode: Option<String>,
    pub(super) poster_path: Option<String>,
    pub(super) release_date: Option<String>,
    pub(super) vote_average: Option<f64>,
    pub(super) runtime: i64,
}

pub(super) enum PersistResult {
    Inserted(u32),
    Destination(DestinationFailure),
    InvalidReference { reference_item_id: Option<i64> },
}

pub(super) fn invalid_reference_message(reference_item_id: Option<i64>) -> String {
    match reference_item_id {
        Some(id) => format!("Reference item {id} is not in this watchlist."),
        None => "Reference item is required for anchored insertion.".into(),
    }
}

pub(super) async fn order_mode(
    lists: &Watchlists,
    watchlist_id: i64,
) -> Result<Option<ItemOrderMode>, DbErr> {
    read_order_mode(&lists.0, watchlist_id).await
}

pub(super) async fn existing_episode_ids(
    lists: &Watchlists,
    watchlist_id: i64,
    show_id: u64,
) -> Result<std::collections::HashSet<String>, DbErr> {
    let parent_id = format!("tmdb:{show_id}");
    lists
        .0
        .query_all_raw(statement(
            "SELECT tmdb_id FROM watchlist_items \
             WHERE watchlist_id = ? AND media_type = 'episode' AND source = 'tmdb' AND parent_id = ?",
            vec![watchlist_id.into(), parent_id.into()],
        ))
        .await?
        .iter()
        .map(|row| row.try_get::<String>("", "tmdb_id"))
        .collect()
}

pub(super) async fn movie_exists(
    lists: &Watchlists,
    watchlist_id: i64,
    tmdb_id: &str,
) -> Result<bool, DbErr> {
    let row = lists
        .0
        .query_one_raw(statement(
            "SELECT id FROM watchlist_items WHERE watchlist_id = ? AND tmdb_id = ? AND media_type = 'movie' LIMIT 1",
            vec![watchlist_id.into(), tmdb_id.to_owned().into()],
        ))
        .await?;
    Ok(row.is_some())
}

/// Inserts `items` and, when at least one row lands, stamps `last_item_added_at`.
///
/// # Errors
///
/// Returns [`DbErr`] when SQLite rejects the transaction. Destination and
/// reference failures are [`PersistResult`] values with no rows written.
pub(super) async fn persist_items(
    lists: &Watchlists,
    watchlist_id: i64,
    items: &[NewItem],
    insertion: &InsertionIntent,
) -> Result<PersistResult, DbErr> {
    if items.is_empty() {
        return Ok(PersistResult::Inserted(0));
    }
    let transaction = lists.0.begin().await?;
    let outcome = write_items(&transaction, watchlist_id, items, insertion).await;
    match outcome {
        Ok(result) => {
            transaction.commit().await?;
            Ok(result)
        }
        Err(error) => {
            let _ = transaction.rollback().await;
            Err(error)
        }
    }
}

async fn write_items(
    transaction: &impl ConnectionTrait,
    watchlist_id: i64,
    items: &[NewItem],
    insertion: &InsertionIntent,
) -> Result<PersistResult, DbErr> {
    let mode = read_order_mode(transaction, watchlist_id).await?;
    if let Err(failure) = validate_addition_destination(mode, insertion.position) {
        return Ok(PersistResult::Destination(failure));
    }
    let Some(mode) = mode else {
        return Ok(PersistResult::Destination(DestinationFailure::NotFound));
    };
    let inserted = match mode {
        ItemOrderMode::Custom => {
            let Some(position) = insertion.position else {
                return Ok(PersistResult::Destination(
                    DestinationFailure::InsertionChoiceRequired,
                ));
            };
            insert_custom(
                transaction,
                watchlist_id,
                items,
                position,
                insertion.reference_item_id,
            )
            .await?
        }
        ItemOrderMode::Release => insert_release(transaction, watchlist_id, items).await?,
    };
    if let PersistResult::Inserted(count) = inserted
        && count > 0
    {
        stamp_last_added(transaction, watchlist_id).await?;
    }
    Ok(inserted)
}

async fn read_order_mode(
    connection: &impl ConnectionTrait,
    watchlist_id: i64,
) -> Result<Option<ItemOrderMode>, DbErr> {
    let Some(row) = connection
        .query_one_raw(statement(
            "SELECT item_order_mode FROM watchlists WHERE id = ?",
            vec![watchlist_id.into()],
        ))
        .await?
    else {
        return Ok(None);
    };
    let stored: String = row.try_get("", "item_order_mode")?;
    Ok(Some(ItemOrderMode::from_stored(&stored)?))
}

async fn insert_release(
    transaction: &impl ConnectionTrait,
    watchlist_id: i64,
    items: &[NewItem],
) -> Result<PersistResult, DbErr> {
    let mut inserted = 0u32;
    for item in items {
        let row = transaction
            .query_one_raw(statement(
                "INSERT INTO watchlist_items (\
                    watchlist_id, tmdb_id, source, media_type, title, parent_id, parent_title, \
                    season, episode, poster_path, release_date, vote_average, runtime, is_watched, \
                    custom_rank\
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL) \
                 ON CONFLICT(watchlist_id, tmdb_id, media_type) DO NOTHING RETURNING id",
                item_values(watchlist_id, item),
            ))
            .await?;
        if row.is_some() {
            inserted += 1;
        }
    }
    Ok(PersistResult::Inserted(inserted))
}

async fn insert_custom(
    transaction: &impl ConnectionTrait,
    watchlist_id: i64,
    items: &[NewItem],
    position: InsertionPosition,
    reference_item_id: Option<i64>,
) -> Result<PersistResult, DbErr> {
    let existing = load_custom_items(transaction, watchlist_id).await?;
    let pending: Vec<PendingInsert> = items
        .iter()
        .map(|item| PendingInsert {
            tmdb_id: item.tmdb_id.clone(),
            media_type: item.media_type.to_owned(),
            release_date: item.release_date.clone(),
        })
        .collect();
    let plan = plan_custom_order(&existing, &pending, position, reference_item_id);
    match plan {
        CustomOrderPlan::Unchanged => Ok(PersistResult::Inserted(0)),
        CustomOrderPlan::InvalidReference { reference_item_id } => {
            Ok(PersistResult::InvalidReference { reference_item_id })
        }
        CustomOrderPlan::Writes { inserts, updates } => {
            let count = inserts.len() as u32;
            for insert in inserts {
                let item = &items[insert.pending_index];
                let mut values = item_values(watchlist_id, item);
                values.push(Some(insert.rank).into());
                transaction
                    .execute_raw(statement(
                        "INSERT INTO watchlist_items (\
                            watchlist_id, tmdb_id, source, media_type, title, parent_id, parent_title, \
                            season, episode, poster_path, release_date, vote_average, runtime, is_watched, \
                            custom_rank\
                         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
                        values,
                    ))
                    .await?;
            }
            for update in updates {
                transaction
                    .execute_raw(statement(
                        "UPDATE watchlist_items SET custom_rank = ? WHERE id = ? AND watchlist_id = ?",
                        vec![update.rank.into(), update.id.into(), watchlist_id.into()],
                    ))
                    .await?;
            }
            Ok(PersistResult::Inserted(count))
        }
    }
}

async fn load_custom_items(
    transaction: &impl ConnectionTrait,
    watchlist_id: i64,
) -> Result<Vec<StoredOrderItem>, DbErr> {
    let sql = format!(
        "SELECT id, tmdb_id, media_type, release_date, custom_rank FROM watchlist_items \
         WHERE watchlist_id = ? ORDER BY {}",
        ItemOrderMode::Custom.order_sql()
    );
    transaction
        .query_all_raw(statement(&sql, vec![watchlist_id.into()]))
        .await?
        .iter()
        .map(|row| {
            Ok(StoredOrderItem {
                id: row.try_get("", "id")?,
                tmdb_id: row.try_get("", "tmdb_id")?,
                media_type: row.try_get("", "media_type")?,
                release_date: row.try_get("", "release_date")?,
                custom_rank: row.try_get("", "custom_rank")?,
            })
        })
        .collect()
}

async fn stamp_last_added(
    transaction: &impl ConnectionTrait,
    watchlist_id: i64,
) -> Result<(), DbErr> {
    transaction
        .execute_raw(statement(
            "UPDATE watchlists SET last_item_added_at = CURRENT_TIMESTAMP WHERE id = ?",
            vec![watchlist_id.into()],
        ))
        .await?;
    Ok(())
}

fn item_values(watchlist_id: i64, item: &NewItem) -> Vec<sea_orm::Value> {
    vec![
        watchlist_id.into(),
        item.tmdb_id.clone().into(),
        item.source.to_owned().into(),
        item.media_type.to_owned().into(),
        item.title.clone().into(),
        item.parent_id.clone().into(),
        item.parent_title.clone().into(),
        item.season.into(),
        item.episode.clone().into(),
        item.poster_path.clone().into(),
        item.release_date.clone().into(),
        vote_value(item.vote_average),
        item.runtime.into(),
    ]
}

fn vote_value(vote_average: Option<f64>) -> sea_orm::Value {
    match vote_average {
        Some(value) => value.into(),
        None => None::<f64>.into(),
    }
}

fn statement(sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}
