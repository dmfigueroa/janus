use super::{ItemOrderMode, Watchlists};
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
        let mode = ItemOrderMode::from_stored(&row.try_get::<String>("", "item_order_mode")?)?;
        if mode != ItemOrderMode::Custom {
            return Ok(ReorderOutcome::Rejected(ReorderFailure::NotCustomMode));
        }
        let mut items = transaction
            .query_all_raw(statement(
                &format!(
                    "SELECT id, custom_rank FROM watchlist_items WHERE watchlist_id=? ORDER BY {}",
                    mode.order_sql()
                ),
                vec![id.into()],
            ))
            .await?
            .iter()
            .map(|row| {
                Ok((
                    row.try_get::<i64>("", "id")?,
                    row.try_get::<Option<i64>>("", "custom_rank")?,
                ))
            })
            .collect::<Result<Vec<_>, DbErr>>()?;
        let Some(source_index) = items
            .iter()
            .position(|(item_id, _)| *item_id == input.moved_item_id)
        else {
            return Ok(ReorderOutcome::Rejected(ReorderFailure::InvalidItem));
        };
        let moved = items.remove(source_index);
        let Some(reference_index) = items
            .iter()
            .position(|(item_id, _)| *item_id == input.reference_item_id)
        else {
            return Ok(ReorderOutcome::Rejected(ReorderFailure::InvalidReference));
        };
        let destination_index =
            reference_index + usize::from(input.position == ReorderPosition::After);
        items.insert(destination_index, moved);
        for (index, (item_id, current_rank)) in items.iter().enumerate() {
            let next_rank = (index + 1) as i64;
            if *current_rank == Some(next_rank) {
                continue;
            }
            transaction
                .execute_raw(statement(
                    "UPDATE watchlist_items SET custom_rank=? WHERE watchlist_id=? AND id=?",
                    vec![next_rank.into(), id.into(), (*item_id).into()],
                ))
                .await?;
        }
        transaction.commit().await?;
        Ok(ReorderOutcome::Reordered)
    }
}
