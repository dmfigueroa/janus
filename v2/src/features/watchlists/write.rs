//! Shared watchlist metadata writes.
//!
//! Web and MCP validate their own transport values, then call these operations.
//! Inserts keep v1's lifecycle and timestamp defaults; updates preserve v1's
//! application-side `updated_at` behavior, which SeaORM does not emulate.

use super::{ItemOrderMode, WatchlistRecord, Watchlists};
use sea_orm::sea_query::Value;
use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement, TransactionTrait};

/// A validated new watchlist. Omitted optional values keep v1's insert defaults.
#[derive(Debug)]
pub struct NewWatchlist {
    pub name: String,
    pub description: Option<String>,
    pub item_order_mode: Option<ItemOrderMode>,
}

/// A validated partial update. An absent field is unchanged; a present
/// description may be cleared with `None`.
#[derive(Debug)]
pub struct WatchlistChanges {
    pub watchlist_id: i64,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub item_order_mode: Option<ItemOrderMode>,
}

/// Expected domain rejection of an update against current stored state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpdateOutcome {
    Updated,
    NotFound,
}

// v1 binds new watchlists to the back of the global rotation with the same
// millisecond-monotonic timestamp expression used for watched/skipped lists.
const NEXT_ROTATION_POSITION: &str = "strftime('%Y-%m-%d %H:%M:%f', MAX(\
  julianday('now'),\
  COALESCE((SELECT MAX(julianday(last_watched_at)) FROM watchlists), 0) + 1.0 / 86400000\
))";

fn statement(sql: &str, values: Vec<Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}

impl Watchlists {
    /// Inserts one watchlist with v1 creation defaults and returns its stored row.
    ///
    /// # Errors
    /// Returns database failures, including lock contention and failed commits.
    pub async fn create_watchlist(&self, input: NewWatchlist) -> Result<WatchlistRecord, DbErr> {
        let transaction = self.0.begin().await?;
        let (sql, values) = match input.item_order_mode {
            Some(mode) => (
                format!(
                    "INSERT INTO watchlists (name, description, item_order_mode, last_watched_at) \
                     VALUES (?, ?, ?, {NEXT_ROTATION_POSITION}) RETURNING *"
                ),
                vec![
                    input.name.into(),
                    input.description.into(),
                    mode.as_str().into(),
                ],
            ),
            None => (
                format!(
                    "INSERT INTO watchlists (name, description, last_watched_at) \
                     VALUES (?, ?, {NEXT_ROTATION_POSITION}) RETURNING *"
                ),
                vec![input.name.into(), input.description.into()],
            ),
        };
        let row = transaction
            .query_one_raw(statement(&sql, values))
            .await?
            .ok_or_else(|| DbErr::Custom("Missing created watchlist row".to_owned()))?;
        let record = super::storage::record(&row)?;
        transaction.commit().await?;
        Ok(record)
    }

    /// Applies a partial update inside one transaction.
    ///
    /// # Errors
    /// Returns database failures, including lock contention and failed commits.
    pub async fn update_watchlist(
        &self,
        changes: WatchlistChanges,
    ) -> Result<UpdateOutcome, DbErr> {
        let transaction = self.0.begin().await?;
        // Take the writer lock before the existence check; never retry an ambiguous commit.
        let locked = transaction
            .execute_raw(statement(
                "UPDATE watchlists SET id=id WHERE id=?",
                vec![changes.watchlist_id.into()],
            ))
            .await?;
        if locked.rows_affected() == 0 {
            return Ok(UpdateOutcome::NotFound);
        }

        if changes.item_order_mode == Some(ItemOrderMode::Custom) {
            let row = transaction
                .query_one_raw(statement(
                    "SELECT item_order_mode FROM watchlists WHERE id=?",
                    vec![changes.watchlist_id.into()],
                ))
                .await?
                .ok_or_else(|| DbErr::Custom("Locked watchlist disappeared".to_owned()))?;
            let current_mode =
                ItemOrderMode::from_stored(&row.try_get::<String>("", "item_order_mode")?)?;
            if current_mode == ItemOrderMode::Release {
                transaction
                    .execute_raw(statement(
                        &format!(
                            "WITH release_order AS (\
                               SELECT id, ROW_NUMBER() OVER (ORDER BY {}) AS rank \
                               FROM watchlist_items WHERE watchlist_id=?\
                             ) \
                             UPDATE watchlist_items \
                             SET custom_rank=(SELECT rank FROM release_order WHERE release_order.id=watchlist_items.id) \
                             WHERE watchlist_id=? \
                               AND NOT EXISTS (SELECT 1 FROM watchlist_items WHERE watchlist_id=? AND custom_rank IS NOT NULL)",
                            ItemOrderMode::Release.order_sql()
                        ),
                        vec![
                            changes.watchlist_id.into(),
                            changes.watchlist_id.into(),
                            changes.watchlist_id.into(),
                        ],
                    ))
                    .await?;
            }
        }

        let mut assignments = vec!["updated_at=CURRENT_TIMESTAMP"];
        let mut values = Vec::new();
        if let Some(name) = changes.name {
            assignments.push("name=?");
            values.push(name.into());
        }
        if let Some(description) = changes.description {
            assignments.push("description=?");
            values.push(
                description
                    .filter(|description| !description.is_empty())
                    .into(),
            );
        }
        if let Some(mode) = changes.item_order_mode {
            assignments.push("item_order_mode=?");
            values.push(mode.as_str().into());
        }
        values.push(changes.watchlist_id.into());
        transaction
            .execute_raw(statement(
                &format!(
                    "UPDATE watchlists SET {} WHERE id=?",
                    assignments.join(", ")
                ),
                values,
            ))
            .await?;
        transaction.commit().await?;
        Ok(UpdateOutcome::Updated)
    }
}
