use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbErr};
use std::{path::Path, time::Duration};

/// V1 owns the schema. V2 opens only existing files and never migrates them.
pub async fn open_database(path: &Path) -> Result<DatabaseConnection, DbErr> {
    let path = path
        .canonicalize()
        .map_err(|_| DbErr::Custom("Existing DATABASE_URL file is required".into()))?;
    if !path.is_file() {
        return Err(DbErr::Custom("DATABASE_URL must be a file".into()));
    }
    let mut options = ConnectOptions::new("sqlite::memory:");
    options
        .max_connections(2)
        .min_connections(1)
        .connect_timeout(Duration::from_secs(5))
        .acquire_timeout(Duration::from_secs(5))
        .sqlx_logging(false)
        .map_sqlx_sqlite_opts(move |options| {
            options
                .filename(&path)
                .in_memory(false)
                .create_if_missing(false)
                .read_only(false)
                .busy_timeout(Duration::from_secs(2))
        });
    let database = Database::connect(options).await?;
    // Explicit projections reject absent/renamed columns without synchronizing anything.
    database.query_all_raw(sea_orm::Statement::from_string(sea_orm::DbBackend::Sqlite,
        "SELECT id,name,description,item_order_mode,created_at,updated_at,last_watched_at,last_item_added_at,paused_at FROM watchlists LIMIT 0".to_owned())).await?;
    database.query_all_raw(sea_orm::Statement::from_string(sea_orm::DbBackend::Sqlite,
        "SELECT id,watchlist_id,tmdb_id,source,media_type,title,parent_id,parent_title,season,episode,poster_path,release_date,vote_average,runtime,custom_rank,is_watched,authors,added_at FROM watchlist_items LIMIT 0".to_owned())).await?;
    validate_schema(&database).await?;
    validate_values(&database).await?;
    Ok(database)
}

async fn validate_schema(database: &DatabaseConnection) -> Result<(), DbErr> {
    let baseline: serde_json::Value = serde_json::from_str(include_str!("v1-schema.json"))
        .map_err(|error| DbErr::Custom(error.to_string()))?;
    for (table, contract) in baseline.as_object().unwrap() {
        for (pragma, key) in [
            ("table_info", "columns"),
            ("foreign_key_list", "foreignKeys"),
            ("index_list", "indexes"),
        ] {
            let rows = database
                .query_all_raw(sea_orm::Statement::from_string(
                    sea_orm::DbBackend::Sqlite,
                    format!("PRAGMA {pragma}('{table}')"),
                ))
                .await?;
            let expected = contract[key].as_array().unwrap();
            if rows.len() != expected.len() {
                return Err(DbErr::Custom(format!(
                    "Incompatible v1 schema: {table} {key}"
                )));
            }
            for (row, expected) in rows.iter().zip(expected) {
                for (field, value) in expected
                    .as_object()
                    .unwrap()
                    .iter()
                    .filter(|(field, _)| field.as_str() != "columns")
                {
                    let actual = if value.is_number() {
                        serde_json::json!(row.try_get::<i64>("", field)?)
                    } else {
                        serde_json::json!(row.try_get::<Option<String>>("", field)?)
                    };
                    if actual != *value {
                        return Err(DbErr::Custom(format!(
                            "Incompatible v1 schema: {table} {field}"
                        )));
                    }
                }
                if let Some(columns) = expected.get("columns") {
                    let name = expected["name"].as_str().unwrap().replace('\'', "''");
                    let actual = database
                        .query_all_raw(sea_orm::Statement::from_string(
                            sea_orm::DbBackend::Sqlite,
                            format!("PRAGMA index_info('{name}')"),
                        ))
                        .await?;
                    let columns = columns.as_array().unwrap();
                    if actual.len() != columns.len() {
                        return Err(DbErr::Custom(format!("Incompatible v1 index: {name}")));
                    }
                    for (row, column) in actual.iter().zip(columns) {
                        if row.try_get::<String>("", "name")? != column["name"].as_str().unwrap() {
                            return Err(DbErr::Custom(format!("Incompatible v1 index: {name}")));
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

async fn validate_values(database: &DatabaseConnection) -> Result<(), DbErr> {
    let checks = [
        "SELECT count(*) AS invalid FROM watchlists WHERE id <= 0 OR typeof(name) != 'text' OR item_order_mode NOT IN ('release','custom') OR typeof(created_at) != 'text' OR typeof(updated_at) NOT IN ('text','null') OR typeof(last_watched_at) NOT IN ('text','null') OR typeof(last_item_added_at) NOT IN ('text','null') OR typeof(paused_at) NOT IN ('text','null')",
        "SELECT count(*) AS invalid FROM watchlist_items WHERE id <= 0 OR typeof(tmdb_id) != 'text' OR typeof(source) != 'text' OR typeof(title) != 'text' OR media_type NOT IN ('movie','episode','game','book','comic','anime','manga') OR (is_watched IS NOT NULL AND (typeof(is_watched) != 'integer' OR is_watched NOT IN (0,1))) OR typeof(added_at) != 'text' OR (authors IS NOT NULL AND CASE WHEN json_valid(authors) THEN json_type(authors) != 'array' OR EXISTS (SELECT 1 FROM json_each(authors) WHERE type != 'text') ELSE 1 END)",
        "SELECT count(*) AS invalid FROM watchlist_items LEFT JOIN watchlists ON watchlists.id=watchlist_items.watchlist_id WHERE watchlists.id IS NULL",
    ];
    for sql in checks {
        let row = database
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                sql.to_owned(),
            ))
            .await?
            .unwrap();
        if row.try_get::<i64>("", "invalid")? != 0 {
            return Err(DbErr::Custom("Incompatible v1 stored values".into()));
        }
    }
    Ok(())
}
