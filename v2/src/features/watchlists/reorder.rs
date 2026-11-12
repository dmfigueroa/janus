use super::Watchlists;
use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement, TransactionTrait};
use serde::Deserialize;

/// A move within one watchlist, evaluated against its complete stored order.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reorder {
    pub moved_item_id: i64,
    pub reference_item_id: i64,
    pub position: ReorderPosition,
}
fn statement(sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}
/// Placement relative to the reference item.
#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReorderPosition {
    Before,
    After,
}

/// Expected rejection of a reorder against current watchlist state.
#[derive(Clone, Copy)]
pub enum ReorderFailure {
    NotFound,
    NotCustomMode,
    InvalidReorder,
    InvalidItem,
    InvalidReference,
}
impl ReorderFailure {
    pub fn code(self) -> &'static str {
        match self {
            Self::NotFound => "not_found",
            Self::NotCustomMode => "not_custom_mode",
            Self::InvalidReorder => "invalid_reorder",
            Self::InvalidItem => "invalid_item",
            Self::InvalidReference => "invalid_reference",
        }
    }
    pub fn message(self) -> &'static str {
        match self {
            Self::NotFound => "Watchlist not found.",
            Self::NotCustomMode => "Reordering is only available in custom mode",
            Self::InvalidReorder => "Moved item and reference item must differ",
            Self::InvalidItem => "Moved item does not belong to this watchlist",
            Self::InvalidReference => "Reference item does not belong to this watchlist",
        }
    }
}
/// The authoritative domain outcome, independent of its transport representation.
pub enum ReorderOutcome {
    Reordered,
    Rejected(ReorderFailure),
}
impl Watchlists {
    /// Atomically applies a move, returning expected domain rejections separately.
    ///
    /// # Errors
    /// Returns database failures, including lock contention and failed commits.
    pub async fn reorder(&self, id: i64, input: Reorder) -> Result<ReorderOutcome, DbErr> {
        if input.moved_item_id == input.reference_item_id {
            return Ok(ReorderOutcome::Rejected(ReorderFailure::InvalidReorder));
        }
        let transaction = self.0.begin().await?;
        // Acquire the SQLite writer lock before reading; never retry an ambiguous commit.
        transaction
            .execute_raw(statement(
                "UPDATE watchlists SET id=id WHERE id=?",
                vec![id.into()],
            ))
            .await?;
        let Some(row) = transaction
            .query_one_raw(statement(
                "SELECT item_order_mode FROM watchlists WHERE id=?",
                vec![id.into()],
            ))
            .await?
        else {
            return Ok(ReorderOutcome::Rejected(ReorderFailure::NotFound));
        };
        if row.try_get::<String>("", "item_order_mode")? != "custom" {
            return Ok(ReorderOutcome::Rejected(ReorderFailure::NotCustomMode));
        }
        let mut ids = transaction.query_all_raw(statement("SELECT id FROM watchlist_items WHERE watchlist_id=? ORDER BY custom_rank IS NULL,custom_rank,CASE WHEN release_date IS NULL OR release_date='' THEN 1 ELSE 0 END,release_date,id", vec![id.into()])).await?.iter().map(|row| row.try_get::<i64>("", "id")).collect::<Result<Vec<_>, _>>()?;
        let Some(old) = ids.iter().position(|value| *value == input.moved_item_id) else {
            return Ok(ReorderOutcome::Rejected(ReorderFailure::InvalidItem));
        };
        ids.remove(old);
        let Some(anchor) = ids
            .iter()
            .position(|value| *value == input.reference_item_id)
        else {
            return Ok(ReorderOutcome::Rejected(ReorderFailure::InvalidReference));
        };
        let next = anchor + usize::from(input.position == ReorderPosition::After);
        ids.insert(next, input.moved_item_id);
        if old != next {
            for (index, item_id) in ids.iter().enumerate() {
                transaction
                    .execute_raw(statement(
                        "UPDATE watchlist_items SET custom_rank=? WHERE watchlist_id=? AND id=?",
                        vec![((index + 1) as i64).into(), id.into(), (*item_id).into()],
                    ))
                    .await?;
            }
        }
        transaction.commit().await?;
        Ok(ReorderOutcome::Reordered)
    }
}
