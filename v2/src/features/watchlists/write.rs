//! Shared watchlist metadata writes.
//!
//! Web and MCP validate their own transport values, then call these operations.
//! Inserts and updates preserve v1's lifecycle defaults and Drizzle's
//! application-side `updated_at` timestamp, which SeaORM does not emulate.

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

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FieldPatch<T> {
    Keep,
    Clear,
    Replace(T),
}

impl<T> FieldPatch<T> {
    pub fn is_keep(&self) -> bool {
        matches!(self, Self::Keep)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemMetadataError {
    TitleRequired,
    ReleaseDateFormat,
    ReleaseDateInvalid,
    PosterPathScheme,
    PosterPathSpaces,
    NoFieldsToUpdate,
}

impl ItemMetadataError {
    pub fn message(self) -> &'static str {
        match self {
            Self::TitleRequired => "Title is required.",
            Self::ReleaseDateFormat => "Release date must be YYYY or YYYY-MM-DD.",
            Self::ReleaseDateInvalid => "Release date must be a valid calendar date.",
            Self::PosterPathScheme => {
                "Poster image must be an HTTPS URL or a provider path beginning with /."
            }
            Self::PosterPathSpaces => "Poster image path must start with / and contain no spaces.",
            Self::NoFieldsToUpdate => "No fields to update.",
        }
    }
}

impl std::fmt::Display for ItemMetadataError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.message())
    }
}

impl std::error::Error for ItemMetadataError {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ItemTitle(String);

impl ItemTitle {
    pub fn parse(value: &str) -> Result<Self, ItemMetadataError> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(ItemMetadataError::TitleRequired);
        }
        Ok(Self(trimmed.to_owned()))
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReleaseDate(String);

impl ReleaseDate {
    pub fn parse(value: &str) -> Result<Self, ItemMetadataError> {
        let bytes = value.as_bytes();
        if bytes.len() == 4 && bytes.iter().all(u8::is_ascii_digit) {
            return Ok(Self(value.to_owned()));
        }
        if bytes.len() == 10
            && bytes[4] == b'-'
            && bytes[7] == b'-'
            && bytes[0..4].iter().all(u8::is_ascii_digit)
            && bytes[5..7].iter().all(u8::is_ascii_digit)
            && bytes[8..10].iter().all(u8::is_ascii_digit)
        {
            let year = parse_decimal(&value[0..4])?;
            let month = parse_decimal(&value[5..7])?;
            let day = parse_decimal(&value[8..10])?;
            if is_valid_civil_date(year, month, day) {
                return Ok(Self(value.to_owned()));
            }
            return Err(ItemMetadataError::ReleaseDateInvalid);
        }
        Err(ItemMetadataError::ReleaseDateFormat)
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

fn parse_decimal(slice: &str) -> Result<u32, ItemMetadataError> {
    slice
        .parse::<u32>()
        .map_err(|_| ItemMetadataError::ReleaseDateFormat)
}

fn is_valid_civil_date(year: u32, month: u32, day: u32) -> bool {
    if !(1..=12).contains(&month) || day == 0 {
        return false;
    }
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => return false,
    };
    day <= max_day
}

fn is_leap_year(year: u32) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PosterPath(String);

impl PosterPath {
    const PREVIEW_TMDB_PREFIX: &'static str = "https://image.tmdb.org/t/p/w500";

    pub fn parse(value: &str) -> Result<Self, ItemMetadataError> {
        if value.starts_with('/') {
            if value.len() > 1 && !value.chars().any(char::is_whitespace) {
                return Ok(Self(value.to_owned()));
            }
            return Err(ItemMetadataError::PosterPathSpaces);
        }
        if is_valid_https_url(value) {
            return Ok(Self(value.to_owned()));
        }
        Err(ItemMetadataError::PosterPathScheme)
    }

    pub fn preview_url(&self) -> String {
        if self.0.starts_with("https://") {
            self.0.clone()
        } else {
            format!("{}{}", Self::PREVIEW_TMDB_PREFIX, self.0)
        }
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

fn is_valid_https_url(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("https://") else {
        return false;
    };
    if rest.is_empty()
        || rest
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return false;
    }
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.is_empty() {
        return false;
    }
    let host_port = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host_port)| host_port);
    if host_port.is_empty() {
        return false;
    }
    if let Some(ipv6_rest) = host_port.strip_prefix('[') {
        let Some((inside, after_bracket)) = ipv6_rest.split_once(']') else {
            return false;
        };
        if inside.is_empty()
            || !inside
                .chars()
                .all(|character| character.is_ascii_hexdigit() || matches!(character, ':' | '.'))
        {
            return false;
        }
        return after_bracket.is_empty()
            || after_bracket
                .strip_prefix(':')
                .is_some_and(is_valid_optional_port);
    }
    let (host, port) = match host_port.split_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (host_port, None),
    };
    if host.is_empty()
        || host.chars().any(|character| {
            matches!(
                character,
                '#' | '/' | ':' | '<' | '>' | '?' | '@' | '[' | '\\' | ']' | '^' | '|'
            )
        })
    {
        return false;
    }
    port.is_none_or(is_valid_optional_port)
}

fn is_valid_optional_port(port: &str) -> bool {
    port.is_empty()
        || (port.bytes().all(|byte| byte.is_ascii_digit()) && port.parse::<u16>().is_ok())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WatchlistItemChanges {
    watchlist_id: i64,
    item_id: i64,
    title: Option<ItemTitle>,
    release_date: FieldPatch<ReleaseDate>,
    poster_path: FieldPatch<PosterPath>,
}

impl WatchlistItemChanges {
    pub fn new(
        watchlist_id: i64,
        item_id: i64,
        title: Option<ItemTitle>,
        release_date: FieldPatch<ReleaseDate>,
        poster_path: FieldPatch<PosterPath>,
    ) -> Result<Self, ItemMetadataError> {
        if title.is_none() && release_date.is_keep() && poster_path.is_keep() {
            return Err(ItemMetadataError::NoFieldsToUpdate);
        }
        Ok(Self {
            watchlist_id,
            item_id,
            title,
            release_date,
            poster_path,
        })
    }

    pub fn watchlist_id(&self) -> i64 {
        self.watchlist_id
    }

    pub fn item_id(&self) -> i64 {
        self.item_id
    }
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
                    "INSERT INTO watchlists (name, description, item_order_mode, updated_at, last_watched_at) \
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP, {NEXT_ROTATION_POSITION}) RETURNING *"
                ),
                vec![
                    input.name.into(),
                    input.description.into(),
                    mode.as_str().into(),
                ],
            ),
            None => (
                format!(
                    "INSERT INTO watchlists (name, description, updated_at, last_watched_at) \
                     VALUES (?, ?, CURRENT_TIMESTAMP, {NEXT_ROTATION_POSITION}) RETURNING *"
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
            let _current_mode =
                ItemOrderMode::from_stored(&row.try_get::<String>("", "item_order_mode")?)?;
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

    pub async fn edit_watchlist_item(
        &self,
        changes: WatchlistItemChanges,
    ) -> Result<UpdateOutcome, DbErr> {
        let mut assignments = Vec::with_capacity(3);
        let mut values = Vec::with_capacity(5);
        if let Some(title) = changes.title {
            assignments.push("title=?");
            values.push(title.into_inner().into());
        }
        match changes.release_date {
            FieldPatch::Keep => {}
            FieldPatch::Clear => {
                assignments.push("release_date=?");
                values.push(Option::<String>::None.into());
            }
            FieldPatch::Replace(release_date) => {
                assignments.push("release_date=?");
                values.push(Some(release_date.into_inner()).into());
            }
        }
        match changes.poster_path {
            FieldPatch::Keep => {}
            FieldPatch::Clear => {
                assignments.push("poster_path=?");
                values.push(Option::<String>::None.into());
            }
            FieldPatch::Replace(poster_path) => {
                assignments.push("poster_path=?");
                values.push(Some(poster_path.into_inner()).into());
            }
        }
        values.push(changes.item_id.into());
        values.push(changes.watchlist_id.into());

        let sql = format!(
            "UPDATE watchlist_items SET {} WHERE id=? AND watchlist_id=? RETURNING id",
            assignments.join(", ")
        );
        let updated = self.0.query_one_raw(statement(&sql, values)).await?;
        Ok(if updated.is_some() {
            UpdateOutcome::Updated
        } else {
            UpdateOutcome::NotFound
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_title_trims_and_rejects_blank_values() {
        assert_eq!(ItemTitle::parse("  Movie  ").unwrap().into_inner(), "Movie");
        assert_eq!(
            ItemTitle::parse("   ").unwrap_err(),
            ItemMetadataError::TitleRequired
        );
        assert_eq!(
            ItemTitle::parse("").unwrap_err(),
            ItemMetadataError::TitleRequired
        );
    }

    #[test]
    fn release_date_accepts_year_only_and_valid_civil_dates() {
        for valid in ["2025", "1999", "2024-02-29", "2000-02-29", "2025-02-03"] {
            assert_eq!(ReleaseDate::parse(valid).unwrap().into_inner(), valid);
        }
    }

    #[test]
    fn release_date_rejects_malformed_and_impossible_calendar_dates() {
        for malformed in ["", "25", "2025-2-3", "2025/02/03", " 2025 "] {
            assert_eq!(
                ReleaseDate::parse(malformed).unwrap_err(),
                ItemMetadataError::ReleaseDateFormat,
                "{malformed}"
            );
        }
        for impossible in [
            "2025-02-29",
            "1900-02-29",
            "2025-04-31",
            "2025-00-10",
            "2025-13-01",
            "2025-01-00",
        ] {
            assert_eq!(
                ReleaseDate::parse(impossible).unwrap_err(),
                ItemMetadataError::ReleaseDateInvalid,
                "{impossible}"
            );
        }
    }

    #[test]
    fn poster_path_allows_https_urls_and_provider_paths_and_rejects_unsafe_values() {
        let https = PosterPath::parse("https://images.example.com/posters/movie.jpg").unwrap();
        assert_eq!(
            https.preview_url(),
            "https://images.example.com/posters/movie.jpg"
        );
        assert!(PosterPath::parse("https://images.example.com:8443/p.jpg?w=500#top").is_ok());
        assert!(PosterPath::parse("https://[::1]/poster.jpg").is_ok());

        let provider = PosterPath::parse("/provider/movie-poster.jpg").unwrap();
        assert_eq!(
            provider.preview_url(),
            "https://image.tmdb.org/t/p/w500/provider/movie-poster.jpg"
        );

        for bad_scheme in [
            "",
            "http://images.example.com/posters/movie.jpg",
            "data:image/png;base64,aW1hZ2U=",
            "javascript:alert(1)",
            "not-a-url",
            "https://",
            "https:///path.jpg",
            "https://images.example.com/has space.jpg",
            "https://images.example.com:99999/poster.jpg",
            "HTTPS://images.example.com/poster.jpg",
        ] {
            assert_eq!(
                PosterPath::parse(bad_scheme).unwrap_err(),
                ItemMetadataError::PosterPathScheme,
                "{bad_scheme}"
            );
        }

        for bad_path in ["/", "/has space.jpg", "/tab\tpath.jpg"] {
            assert_eq!(
                PosterPath::parse(bad_path).unwrap_err(),
                ItemMetadataError::PosterPathSpaces,
                "{bad_path}"
            );
        }
    }

    #[test]
    fn watchlist_item_changes_rejects_empty_patches() {
        let error =
            WatchlistItemChanges::new(1, 2, None, FieldPatch::Keep, FieldPatch::Keep).unwrap_err();
        assert_eq!(error, ItemMetadataError::NoFieldsToUpdate);
        assert_eq!(error.message(), "No fields to update.");
    }
}
