use super::{ItemOrderMode, Watchlists};
use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement, TransactionTrait, Value};
use uuid::Uuid;

const INSERTION_CHOICE_REQUIRED: &str = "Choose where to insert this item in the custom order.";
const UNSUPPORTED_TV: &str = "TV shows must come from TMDB so Janus can expand them into episodes.";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CustomMediaType {
    Movie,
    Tv,
    Episode,
    Book,
    Game,
    Comic,
}

impl CustomMediaType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Movie => "movie",
            Self::Tv => "tv",
            Self::Episode => "episode",
            Self::Book => "book",
            Self::Game => "game",
            Self::Comic => "comic",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "movie" => Some(Self::Movie),
            "tv" => Some(Self::Tv),
            "episode" => Some(Self::Episode),
            "book" => Some(Self::Book),
            "game" => Some(Self::Game),
            "comic" => Some(Self::Comic),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InsertionPosition {
    Beginning,
    End,
    Before,
    After,
}

impl InsertionPosition {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Beginning => "beginning",
            Self::End => "end",
            Self::Before => "before",
            Self::After => "after",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "beginning" => Some(Self::Beginning),
            "end" => Some(Self::End),
            "before" => Some(Self::Before),
            "after" => Some(Self::After),
            _ => None,
        }
    }

    fn is_anchor(self) -> bool {
        matches!(self, Self::Before | Self::After)
    }
}

#[derive(Debug)]
pub struct CustomItemAddition {
    pub watchlist_id: i64,
    pub title: String,
    pub media_type: CustomMediaType,
    pub year: Option<String>,
    pub release_date: Option<String>,
    pub parent_title: Option<String>,
    pub episode: Option<String>,
    pub insertion_position: Option<InsertionPosition>,
    pub reference_item_id: Option<i64>,
}

#[derive(Debug)]
pub struct CustomItemInput<'a> {
    pub watchlist_id: Option<i64>,
    pub title: Option<&'a str>,
    pub media_type: Option<&'a str>,
    pub year: Option<&'a str>,
    pub release_date: Option<&'a str>,
    pub parent_title: Option<&'a str>,
    pub episode: Option<&'a str>,
    pub insertion_position: Option<&'a str>,
    pub reference_item_id: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AddCustomFailure {
    NotFound,
    InsertionChoiceRequired,
    NotCustomMode,
    InvalidReference(String),
    Unsupported,
    Validation(String),
}

impl AddCustomFailure {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound => "not_found",
            Self::InsertionChoiceRequired => "insertion_choice_required",
            Self::NotCustomMode => "not_custom_mode",
            Self::InvalidReference(_) => "invalid_reference",
            Self::Unsupported => "unsupported",
            Self::Validation(_) => "validation_error",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::NotFound => "Watchlist not found.",
            Self::InsertionChoiceRequired => INSERTION_CHOICE_REQUIRED,
            Self::NotCustomMode => "Anchored insertion is only available in custom mode.",
            Self::InvalidReference(message) | Self::Validation(message) => message,
            Self::Unsupported => UNSUPPORTED_TV,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AddCustomOutcome {
    Added { affected_count: u32 },
    Duplicate { affected_count: u32 },
    Rejected(AddCustomFailure),
}

impl AddCustomOutcome {
    pub fn code(&self) -> &str {
        match self {
            Self::Added { .. } => "added",
            Self::Duplicate { .. } => "duplicate",
            Self::Rejected(failure) => failure.code(),
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Added { .. } => "Added to watchlist",
            Self::Duplicate { .. } => "Already in watchlist",
            Self::Rejected(failure) => failure.message(),
        }
    }

    pub fn success(&self) -> bool {
        matches!(self, Self::Added { .. } | Self::Duplicate { .. })
    }

    pub fn affected_count(&self) -> u32 {
        match self {
            Self::Added { affected_count } | Self::Duplicate { affected_count } => *affected_count,
            Self::Rejected(_) => 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomItemForm {
    pub action: String,
    pub title: String,
    pub media_type: String,
    pub year: String,
    pub insertion_position: String,
    pub custom_order: bool,
    pub error: Option<String>,
}

impl CustomItemForm {
    pub fn for_watchlist(watchlist_id: i64, custom_order: bool) -> Self {
        Self {
            action: format!("/v2/watchlists/{watchlist_id}/custom-items"),
            title: String::new(),
            media_type: "movie".into(),
            year: String::new(),
            insertion_position: String::new(),
            custom_order,
            error: None,
        }
    }

    pub fn title_invalid(&self) -> bool {
        self.error.as_deref() == Some("Title is required.")
    }

    pub fn movie_selected(&self) -> bool {
        self.media_type == "movie"
    }

    pub fn tv_selected(&self) -> bool {
        self.media_type == "tv"
    }

    pub fn book_selected(&self) -> bool {
        self.media_type == "book"
    }

    pub fn game_selected(&self) -> bool {
        self.media_type == "game"
    }

    pub fn comic_selected(&self) -> bool {
        self.media_type == "comic"
    }

    pub fn insertion_placeholder_selected(&self) -> bool {
        self.insertion_position.is_empty()
    }

    pub fn insertion_beginning_selected(&self) -> bool {
        self.insertion_position == "beginning"
    }

    pub fn insertion_end_selected(&self) -> bool {
        self.insertion_position == "end"
    }

    pub fn with_error(mut self, error: impl Into<String>) -> Self {
        self.error = Some(error.into());
        self
    }

    pub fn retain(
        mut self,
        title: &str,
        media_type: &str,
        year: &str,
        insertion_position: &str,
    ) -> Self {
        self.title = title.to_owned();
        self.media_type = media_type.to_owned();
        self.year = year.to_owned();
        self.insertion_position = insertion_position.to_owned();
        self
    }
}

fn statement(sql: &str, values: Vec<Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql, values)
}

pub fn parse_addition(input: CustomItemInput<'_>) -> Result<CustomItemAddition, AddCustomFailure> {
    let watchlist_id = input
        .watchlist_id
        .filter(|id| *id > 0)
        .ok_or_else(|| AddCustomFailure::Validation("Required".into()))?;
    let title = input
        .title
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AddCustomFailure::Validation("Title is required.".into()))?
        .to_owned();
    let media_type = input
        .media_type
        .and_then(CustomMediaType::parse)
        .ok_or_else(|| AddCustomFailure::Validation("Invalid media type.".into()))?;
    let year = optional_release_date(input.year)?;
    let release_date = optional_release_date(input.release_date)?;
    let parent_title = optional_trimmed(input.parent_title);
    let episode = optional_trimmed(input.episode);
    let insertion_position =
        match input.insertion_position {
            None => None,
            Some(value) => Some(InsertionPosition::parse(value).ok_or_else(|| {
                AddCustomFailure::Validation("Invalid insertion position.".into())
            })?),
        };
    validate_anchor_fields(insertion_position, input.reference_item_id)?;
    validate_episode_fields(media_type, parent_title.as_deref(), episode.as_deref())?;
    Ok(CustomItemAddition {
        watchlist_id,
        title,
        media_type,
        year,
        release_date,
        parent_title,
        episode,
        insertion_position,
        reference_item_id: input.reference_item_id,
    })
}

fn optional_trimmed(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn optional_release_date(value: Option<&str>) -> Result<Option<String>, AddCustomFailure> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(None),
        Some(value) => {
            super::release_date::validate(value)
                .map_err(|message| AddCustomFailure::Validation(message.into()))?;
            Ok(Some(value.to_owned()))
        }
    }
}

fn validate_anchor_fields(
    insertion_position: Option<InsertionPosition>,
    reference_item_id: Option<i64>,
) -> Result<(), AddCustomFailure> {
    match insertion_position {
        Some(position) if position.is_anchor() => {
            if reference_item_id.is_none_or(|id| id <= 0) {
                return Err(AddCustomFailure::Validation(
                    "referenceItemId is required when insertionPosition is before or after.".into(),
                ));
            }
        }
        _ if reference_item_id.is_some() => {
            return Err(AddCustomFailure::Validation(
                "referenceItemId may only be set when insertionPosition is before or after.".into(),
            ));
        }
        _ => {}
    }
    Ok(())
}

fn validate_episode_fields(
    media_type: CustomMediaType,
    parent_title: Option<&str>,
    episode: Option<&str>,
) -> Result<(), AddCustomFailure> {
    if media_type != CustomMediaType::Episode {
        return Ok(());
    }
    if parent_title.is_none() {
        return Err(AddCustomFailure::Validation(
            "Series title is required.".into(),
        ));
    }
    if episode.is_none() {
        return Err(AddCustomFailure::Validation(
            "Episode label is required.".into(),
        ));
    }
    Ok(())
}

fn custom_parent_id(parent_title: &str) -> String {
    let lowered: String = parent_title.chars().flat_map(char::to_lowercase).collect();
    format!("custom:{}", encode_uri_component(&lowered))
}

fn encode_uri_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => encoded.push(byte as char),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn custom_release_date(addition: &CustomItemAddition) -> Option<String> {
    addition
        .release_date
        .clone()
        .or_else(|| addition.year.clone())
}

struct PendingItem {
    tmdb_id: String,
    media_type: CustomMediaType,
    title: String,
    parent_id: Option<String>,
    parent_title: Option<String>,
    episode: Option<String>,
    release_date: Option<String>,
}

fn build_pending(addition: &CustomItemAddition) -> PendingItem {
    let release_date = custom_release_date(addition);
    if addition.media_type == CustomMediaType::Episode {
        let parent_title = addition.parent_title.clone().expect("validated");
        return PendingItem {
            tmdb_id: format!("custom-{}", Uuid::new_v4()),
            media_type: addition.media_type,
            title: addition.title.clone(),
            parent_id: Some(custom_parent_id(&parent_title)),
            parent_title: Some(parent_title),
            episode: addition.episode.clone(),
            release_date,
        };
    }
    PendingItem {
        tmdb_id: format!("custom-{}", Uuid::new_v4()),
        media_type: addition.media_type,
        title: addition.title.clone(),
        parent_id: None,
        parent_title: None,
        episode: None,
        release_date,
    }
}

struct ExistingOrderItem {
    id: i64,
    tmdb_id: String,
    media_type: String,
    custom_rank: Option<i64>,
}

enum OrderEntry {
    Existing(ExistingOrderItem),
    Pending,
}

impl Watchlists {
    /// Inserts one custom item, returning expected domain rejections separately.
    ///
    /// # Errors
    /// Returns database failures, including lock contention and failed commits.
    pub async fn add_custom_item(
        &self,
        addition: CustomItemAddition,
    ) -> Result<AddCustomOutcome, DbErr> {
        if addition.media_type == CustomMediaType::Tv {
            return Ok(AddCustomOutcome::Rejected(AddCustomFailure::Unsupported));
        }
        let pending = build_pending(&addition);
        let transaction = self.0.begin().await?;
        transaction
            .execute_raw(statement(
                "UPDATE watchlists SET id=id WHERE id=?",
                vec![addition.watchlist_id.into()],
            ))
            .await?;
        let Some(row) = transaction
            .query_one_raw(statement(
                "SELECT item_order_mode FROM watchlists WHERE id=?",
                vec![addition.watchlist_id.into()],
            ))
            .await?
        else {
            return Ok(AddCustomOutcome::Rejected(AddCustomFailure::NotFound));
        };
        let mode = ItemOrderMode::from_stored(&row.try_get::<String>("", "item_order_mode")?)?;
        if let Some(failure) = destination_failure(mode, addition.insertion_position) {
            return Ok(AddCustomOutcome::Rejected(failure));
        }
        let inserted = match mode {
            ItemOrderMode::Release => {
                insert_release_order(&transaction, addition.watchlist_id, &pending).await?
            }
            ItemOrderMode::Custom => {
                insert_custom_order(
                    &transaction,
                    addition.watchlist_id,
                    &pending,
                    addition.insertion_position.expect("validated for custom"),
                    addition.reference_item_id,
                )
                .await?
            }
        };
        let outcome = match inserted {
            Ok(0) => AddCustomOutcome::Duplicate { affected_count: 0 },
            Ok(count) => {
                transaction
                    .execute_raw(statement(
                        "UPDATE watchlists SET last_item_added_at=CURRENT_TIMESTAMP WHERE id=?",
                        vec![addition.watchlist_id.into()],
                    ))
                    .await?;
                AddCustomOutcome::Added {
                    affected_count: count,
                }
            }
            Err(failure) => AddCustomOutcome::Rejected(failure),
        };
        match &outcome {
            AddCustomOutcome::Rejected(_) => Ok(outcome),
            AddCustomOutcome::Added { .. } | AddCustomOutcome::Duplicate { .. } => {
                transaction.commit().await?;
                Ok(outcome)
            }
        }
    }
}

fn destination_failure(
    mode: ItemOrderMode,
    insertion_position: Option<InsertionPosition>,
) -> Option<AddCustomFailure> {
    match mode {
        ItemOrderMode::Custom => insertion_position
            .is_none()
            .then_some(AddCustomFailure::InsertionChoiceRequired),
        ItemOrderMode::Release => insertion_position
            .filter(|position| position.is_anchor())
            .map(|_| AddCustomFailure::NotCustomMode),
    }
}

async fn insert_release_order(
    transaction: &impl ConnectionTrait,
    watchlist_id: i64,
    pending: &PendingItem,
) -> Result<Result<u32, AddCustomFailure>, DbErr> {
    let result = transaction
        .execute_raw(statement(
            "INSERT INTO watchlist_items \
             (watchlist_id, tmdb_id, source, media_type, title, parent_id, parent_title, episode, \
              poster_path, release_date, vote_average, runtime) \
             VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, NULL, ?, NULL, 0) \
             ON CONFLICT DO NOTHING",
            vec![
                watchlist_id.into(),
                pending.tmdb_id.clone().into(),
                pending.media_type.as_str().into(),
                pending.title.clone().into(),
                pending.parent_id.clone().into(),
                pending.parent_title.clone().into(),
                pending.episode.clone().into(),
                pending.release_date.clone().into(),
            ],
        ))
        .await?;
    Ok(Ok(result.rows_affected() as u32))
}

async fn insert_custom_order(
    transaction: &impl ConnectionTrait,
    watchlist_id: i64,
    pending: &PendingItem,
    insertion_position: InsertionPosition,
    reference_item_id: Option<i64>,
) -> Result<Result<u32, AddCustomFailure>, DbErr> {
    let existing = transaction
        .query_all_raw(statement(
            &format!(
                "SELECT id, tmdb_id, media_type, custom_rank FROM watchlist_items \
                 WHERE watchlist_id=? ORDER BY {},id",
                ItemOrderMode::Custom.order_sql()
            ),
            vec![watchlist_id.into()],
        ))
        .await?
        .into_iter()
        .map(|row| {
            Ok(ExistingOrderItem {
                id: row.try_get("", "id")?,
                tmdb_id: row.try_get("", "tmdb_id")?,
                media_type: row.try_get("", "media_type")?,
                custom_rank: row.try_get("", "custom_rank")?,
            })
        })
        .collect::<Result<Vec<_>, DbErr>>()?;

    let key = format!("{}::{}", pending.tmdb_id, pending.media_type.as_str());
    if existing
        .iter()
        .any(|item| format!("{}::{}", item.tmdb_id, item.media_type) == key)
    {
        return Ok(Ok(0));
    }

    let mut order: Vec<OrderEntry> = existing.into_iter().map(OrderEntry::Existing).collect();
    let splice = match splice_index(&order, insertion_position, reference_item_id) {
        Ok(index) => index,
        Err(failure) => return Ok(Err(failure)),
    };
    order.insert(splice, OrderEntry::Pending);

    let mut inserted = 0_u32;
    for (index, entry) in order.into_iter().enumerate() {
        let rank = (index + 1) as i64;
        match entry {
            OrderEntry::Pending => {
                transaction
                    .execute_raw(statement(
                        "INSERT INTO watchlist_items \
                         (watchlist_id, tmdb_id, source, media_type, title, parent_id, parent_title, \
                          episode, poster_path, release_date, vote_average, runtime, custom_rank) \
                         VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, NULL, ?, NULL, 0, ?)",
                        vec![
                            watchlist_id.into(),
                            pending.tmdb_id.clone().into(),
                            pending.media_type.as_str().into(),
                            pending.title.clone().into(),
                            pending.parent_id.clone().into(),
                            pending.parent_title.clone().into(),
                            pending.episode.clone().into(),
                            pending.release_date.clone().into(),
                            rank.into(),
                        ],
                    ))
                    .await?;
                inserted += 1;
            }
            OrderEntry::Existing(item) => {
                transaction
                    .execute_raw(statement(
                        "UPDATE watchlist_items SET custom_rank=? WHERE watchlist_id=? AND id=?",
                        vec![rank.into(), watchlist_id.into(), item.id.into()],
                    ))
                    .await?;
            }
        }
    }
    Ok(Ok(inserted))
}

fn splice_index(
    order: &[OrderEntry],
    insertion_position: InsertionPosition,
    reference_item_id: Option<i64>,
) -> Result<usize, AddCustomFailure> {
    match insertion_position {
        InsertionPosition::Beginning => Ok(0),
        InsertionPosition::End => Ok(order.len()),
        InsertionPosition::Before | InsertionPosition::After => {
            let Some(reference_item_id) = reference_item_id else {
                return Err(AddCustomFailure::InvalidReference(
                    "Reference item is required for anchored insertion.".into(),
                ));
            };
            let reference_index = order.iter().position(|entry| match entry {
                OrderEntry::Existing(item) => {
                    item.id == reference_item_id && item.custom_rank.is_some()
                }
                OrderEntry::Pending => false,
            });
            let Some(reference_index) = reference_index else {
                return Err(AddCustomFailure::InvalidReference(format!(
                    "Reference item {reference_item_id} is not in this watchlist."
                )));
            };
            Ok(reference_index + usize::from(insertion_position == InsertionPosition::After))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parent_id_encodes_like_v1() {
        assert_eq!(custom_parent_id("A B"), "custom:a%20b");
        assert_eq!(custom_parent_id("A-B"), "custom:a-b");
    }

    #[test]
    fn episode_fields_are_required() {
        let error = parse_addition(CustomItemInput {
            watchlist_id: Some(1),
            title: Some("First"),
            media_type: Some("episode"),
            year: None,
            release_date: None,
            parent_title: None,
            episode: None,
            insertion_position: None,
            reference_item_id: None,
        })
        .unwrap_err();
        assert_eq!(error.code(), "validation_error");
    }
}
