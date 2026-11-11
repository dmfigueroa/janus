use sea_orm::{
    ConnectionTrait, DatabaseConnection, DbBackend, DbErr, QueryResult, Statement, TransactionTrait,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct Watchlists(pub DatabaseConnection);

fn statement(sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}
fn text(row: &QueryResult, column: &str) -> Result<Option<String>, DbErr> {
    row.try_get("", column)
}
fn record(row: &QueryResult, fields: &[(&str, &str)]) -> Result<Value, DbErr> {
    let mut result = serde_json::Map::new();
    result.insert("id".into(), json!(row.try_get::<i64>("", "id")?));
    for (column, key) in fields {
        result.insert((*key).into(), json!(text(row, column)?));
    }
    Ok(Value::Object(result))
}
fn item(row: &QueryResult) -> Result<Value, DbErr> {
    let mut result = record(
        row,
        &[
            ("tmdb_id", "tmdbId"),
            ("source", "source"),
            ("media_type", "mediaType"),
            ("title", "title"),
            ("parent_id", "parentId"),
            ("parent_title", "parentTitle"),
            ("episode", "episode"),
            ("poster_path", "posterPath"),
            ("release_date", "releaseDate"),
            ("added_at", "addedAt"),
        ],
    )?;
    for (column, key) in [
        ("watchlist_id", "watchlistId"),
        ("season", "season"),
        ("runtime", "runtime"),
        ("custom_rank", "customRank"),
    ] {
        result[key] = json!(row.try_get::<Option<i64>>("", column)?);
    }
    result["voteAverage"] = json!(row.try_get::<Option<f64>>("", "vote_average")?);
    result["isWatched"] = json!(row.try_get::<Option<bool>>("", "is_watched")?);
    result["authors"] = match text(row, "authors")? {
        Some(value) => {
            serde_json::from_str(&value).map_err(|error| DbErr::Custom(error.to_string()))?
        }
        None => Value::Null,
    };
    Ok(result)
}
impl Watchlists {
    pub async fn detail(&self, id: i64) -> Result<Option<Value>, DbErr> {
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
        let mut watchlist = watchlist_record(&row)?;
        let mode = watchlist["itemOrderMode"]
            .as_str()
            .unwrap_or("release")
            .to_owned();
        let ordering = if mode == "custom" {
            "custom_rank IS NULL,custom_rank,"
        } else {
            ""
        };
        let sql = format!(
            "SELECT * FROM watchlist_items WHERE watchlist_id = ? ORDER BY {ordering} CASE WHEN release_date IS NULL OR release_date = '' THEN 1 ELSE 0 END,release_date,id"
        );
        let items: Vec<Value> = transaction
            .query_all_raw(statement(&sql, vec![id.into()]))
            .await?
            .iter()
            .map(item)
            .collect::<Result<_, _>>()?;
        transaction.commit().await?;
        let watched = items
            .iter()
            .filter(|item| item["isWatched"] == true)
            .count();
        let next = items.iter().find(|item| item["isWatched"] != true);
        let cover = next.or(items.first());
        watchlist["stats"] = stats(items.len(), watched, next, cover);
        let ids = items
            .iter()
            .map(|item| item["id"].to_string())
            .collect::<Vec<_>>()
            .join(",");
        let token = format!("sha256:{:x}", Sha256::digest(format!("{id}:{mode}:{ids}")));
        Ok(Some(
            json!({"watchlist":watchlist,"items":items,"orderToken":token}),
        ))
    }
    pub async fn headers(&self) -> Result<Vec<Value>, DbErr> {
        self.0
            .query_all_raw(statement("SELECT * FROM watchlists", vec![]))
            .await?
            .iter()
            .map(watchlist_record)
            .collect()
    }
}
pub fn mcp_item(item: &Value) -> Value {
    json!({"id":item["id"],"watchlistId":item["watchlistId"],"provider":item["source"],"providerId":item["tmdbId"],"mediaType":item["mediaType"],"title":item["title"],"parent":{"providerId":item["parentId"],"title":item["parentTitle"]},"episode":item["episode"],"isWatched":item["isWatched"]})
}

pub mod web;

pub mod mcp;

mod discovery;

mod contracts;

fn watchlist_record(row: &QueryResult) -> Result<Value, DbErr> {
    record(
        row,
        &[
            ("name", "name"),
            ("description", "description"),
            ("item_order_mode", "itemOrderMode"),
            ("created_at", "createdAt"),
            ("updated_at", "updatedAt"),
            ("last_watched_at", "lastWatchedAt"),
            ("last_item_added_at", "lastItemAddedAt"),
            ("paused_at", "pausedAt"),
        ],
    )
}

impl Watchlists {
    async fn summary(&self, id: i64) -> Result<Option<Value>, DbErr> {
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
        let mut list = watchlist_record(&row)?;
        let ordering = if list["itemOrderMode"] == "custom" {
            "custom_rank IS NULL,custom_rank,"
        } else {
            ""
        };
        let ordering = format!(
            "{ordering} CASE WHEN release_date IS NULL OR release_date='' THEN 1 ELSE 0 END,release_date,id"
        );
        let counts=transaction.query_one_raw(statement("SELECT count(*) AS total,sum(CASE WHEN is_watched THEN 1 ELSE 0 END) AS watched FROM watchlist_items WHERE watchlist_id=?",vec![id.into()])).await?.unwrap();
        let total = counts.try_get::<i64>("", "total")?;
        let watched = counts.try_get::<Option<i64>>("", "watched")?.unwrap_or(0);
        let next=transaction.query_one_raw(statement(&format!("SELECT * FROM watchlist_items WHERE watchlist_id=? AND COALESCE(is_watched,0)=0 ORDER BY {ordering} LIMIT 1"),vec![id.into()])).await?.as_ref().map(item).transpose()?;
        let cover = if let Some(next) = &next {
            Some(next.clone())
        } else {
            transaction.query_one_raw(statement(&format!("SELECT * FROM watchlist_items WHERE watchlist_id=? ORDER BY {ordering} LIMIT 1"),vec![id.into()])).await?.as_ref().map(item).transpose()?
        };
        transaction.commit().await?;
        list["stats"] = stats(
            total as usize,
            watched as usize,
            next.as_ref(),
            cover.as_ref(),
        );
        Ok(Some(list))
    }
}
fn stats(total: usize, watched: usize, next: Option<&Value>, cover: Option<&Value>) -> Value {
    let progress = if total == 0 {
        0
    } else if total == watched {
        100
    } else {
        ((watched as f64 / total as f64 * 100.0).round() as usize).min(99)
    };
    json!({"totalItems":total,"watchedItems":watched,"progress":progress,"nextUnwatched":next,"coverImage":cover.map(|item| &item["posterPath"]),"coverMediaType":cover.map(|item| &item["mediaType"])})
}
