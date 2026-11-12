use super::Watchlists;
use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement, TransactionTrait};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reorder {
    pub moved_item_id: i64,
    pub reference_item_id: i64,
    pub position: String,
}
fn statement(sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}
fn failure(code: &str, message: &str) -> Value {
    json!({"success":false,"code":code,"message":message})
}
impl Watchlists {
    pub async fn reorder(&self, id: i64, input: Reorder) -> Result<Value, DbErr> {
        if input.moved_item_id == input.reference_item_id {
            return Ok(failure(
                "invalid_reorder",
                "Moved item and reference item must differ",
            ));
        }
        if !matches!(input.position.as_str(), "before" | "after") {
            return Ok(failure("validation_error", "Invalid position"));
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
            return Ok(failure("not_found", "Watchlist not found."));
        };
        if row.try_get::<String>("", "item_order_mode")? != "custom" {
            return Ok(failure(
                "not_custom_mode",
                "Reordering is only available in custom mode",
            ));
        }
        let mut ids = transaction.query_all_raw(statement("SELECT id FROM watchlist_items WHERE watchlist_id=? ORDER BY custom_rank IS NULL,custom_rank,CASE WHEN release_date IS NULL OR release_date='' THEN 1 ELSE 0 END,release_date,id", vec![id.into()])).await?.iter().map(|row| row.try_get::<i64>("", "id")).collect::<Result<Vec<_>, _>>()?;
        let Some(old) = ids.iter().position(|value| *value == input.moved_item_id) else {
            return Ok(failure(
                "invalid_item",
                "Moved item does not belong to this watchlist",
            ));
        };
        ids.remove(old);
        let Some(anchor) = ids
            .iter()
            .position(|value| *value == input.reference_item_id)
        else {
            return Ok(failure(
                "invalid_reference",
                "Reference item does not belong to this watchlist",
            ));
        };
        let next = anchor + usize::from(input.position == "after");
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
        Ok(json!({"success":true}))
    }
}
