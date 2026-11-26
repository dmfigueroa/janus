use super::WatchlistItem;
use super::write::{
    FieldPatch, ItemMetadataError, ItemTitle, PosterPath, ReleaseDate, WatchlistItemChanges,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemInvalidField {
    Title,
    ReleaseDate,
    PosterPath,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum RawField {
    #[default]
    Omitted,
    Null,
    Value(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemEditEncoding {
    Form,
    Json,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemEditForm {
    pub watchlist_id: i64,
    pub item_id: i64,
    pub action: String,
    pub item_title: String,
    pub title: String,
    pub release_date: String,
    pub poster_path: String,
    pub poster_preview_url: Option<String>,
    pub error: Option<String>,
    pub invalid_field: Option<ItemInvalidField>,
}

impl ItemEditForm {
    pub fn for_item(item: &WatchlistItem) -> Self {
        let poster_path = item.poster_path.clone().unwrap_or_default();
        let poster_preview_url = preview_url_for(&poster_path);
        Self {
            watchlist_id: item.watchlist_id,
            item_id: item.id,
            action: format!("/v2/watchlists/{}/items/{}", item.watchlist_id, item.id),
            item_title: item.title.clone(),
            title: item.title.clone(),
            release_date: item.release_date.clone().unwrap_or_default(),
            poster_path,
            poster_preview_url,
            error: None,
            invalid_field: None,
        }
    }

    pub fn missing(watchlist_id: i64, item_id: i64) -> Self {
        Self {
            watchlist_id,
            item_id,
            action: format!("/v2/watchlists/{watchlist_id}/items/{item_id}"),
            item_title: String::new(),
            title: String::new(),
            release_date: String::new(),
            poster_path: String::new(),
            poster_preview_url: None,
            error: Some(ItemEditFailure::NotFound.message().into()),
            invalid_field: None,
        }
    }

    pub fn title_invalid(&self) -> bool {
        self.invalid_field == Some(ItemInvalidField::Title)
    }

    pub fn release_date_invalid(&self) -> bool {
        self.invalid_field == Some(ItemInvalidField::ReleaseDate)
    }

    pub fn poster_invalid(&self) -> bool {
        self.invalid_field == Some(ItemInvalidField::PosterPath)
    }

    pub fn poster_preview_src(&self) -> &str {
        self.poster_preview_url.as_deref().unwrap_or("")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemEditInput {
    pub title: RawField,
    pub release_date: RawField,
    pub poster_path: RawField,
    pub encoding: ItemEditEncoding,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemEditFailure {
    Validation(&'static str, Option<ItemInvalidField>),
    NotFound,
    Internal,
}

impl ItemEditFailure {
    pub fn code(self) -> &'static str {
        match self {
            Self::Validation(_, _) => "validation_error",
            Self::NotFound => "not_found",
            Self::Internal => "internal_error",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            Self::Validation(message, _) => message,
            Self::NotFound => "Watchlist item not found.",
            Self::Internal => "Failed to save changes. Please try again.",
        }
    }

    fn invalid_field(self) -> Option<ItemInvalidField> {
        match self {
            Self::Validation(_, field) => field,
            Self::NotFound | Self::Internal => None,
        }
    }
}

#[derive(Debug)]
pub struct ItemEditRejection {
    pub failure: ItemEditFailure,
    pub form: Box<ItemEditForm>,
}

impl ItemEditRejection {
    pub fn missing(watchlist_id: i64, item_id: i64) -> Self {
        Self {
            failure: ItemEditFailure::NotFound,
            form: Box::new(ItemEditForm::missing(watchlist_id, item_id)),
        }
    }
}

pub fn submit(
    item: &WatchlistItem,
    input: &ItemEditInput,
) -> Result<WatchlistItemChanges, ItemEditRejection> {
    parse_changes(item, input).map_err(|failure| rejected(item, input, failure))
}

pub fn rejected(
    item: &WatchlistItem,
    input: &ItemEditInput,
    failure: ItemEditFailure,
) -> ItemEditRejection {
    ItemEditRejection {
        failure,
        form: Box::new(retained_form(item, input, failure)),
    }
}

fn parse_changes(
    item: &WatchlistItem,
    input: &ItemEditInput,
) -> Result<WatchlistItemChanges, ItemEditFailure> {
    let title = match &input.title {
        RawField::Omitted => None,
        RawField::Null => {
            return Err(ItemEditFailure::Validation(
                ItemMetadataError::TitleRequired.message(),
                Some(ItemInvalidField::Title),
            ));
        }
        RawField::Value(raw) => Some(ItemTitle::parse(raw).map_err(|error| {
            ItemEditFailure::Validation(error.message(), Some(ItemInvalidField::Title))
        })?),
    };

    let release_date = match &input.release_date {
        RawField::Omitted => FieldPatch::Keep,
        RawField::Null => FieldPatch::Clear,
        RawField::Value(raw) if input.encoding == ItemEditEncoding::Form && raw.is_empty() => {
            FieldPatch::Clear
        }
        RawField::Value(raw) => FieldPatch::Replace(ReleaseDate::parse(raw).map_err(|error| {
            ItemEditFailure::Validation(error.message(), Some(ItemInvalidField::ReleaseDate))
        })?),
    };

    let poster_path = match &input.poster_path {
        RawField::Omitted => FieldPatch::Keep,
        RawField::Null => FieldPatch::Clear,
        RawField::Value(raw) if input.encoding == ItemEditEncoding::Form && raw.is_empty() => {
            FieldPatch::Clear
        }
        RawField::Value(raw) => FieldPatch::Replace(PosterPath::parse(raw).map_err(|error| {
            ItemEditFailure::Validation(error.message(), Some(ItemInvalidField::PosterPath))
        })?),
    };

    WatchlistItemChanges::new(item.watchlist_id, item.id, title, release_date, poster_path)
        .map_err(|error| ItemEditFailure::Validation(error.message(), None))
}

fn retained_form(
    item: &WatchlistItem,
    input: &ItemEditInput,
    failure: ItemEditFailure,
) -> ItemEditForm {
    let title = retained_value(&input.title, &item.title);
    let release_date = retained_value(
        &input.release_date,
        item.release_date.as_deref().unwrap_or(""),
    );
    let poster_path = retained_value(
        &input.poster_path,
        item.poster_path.as_deref().unwrap_or(""),
    );
    let poster_preview_url = preview_url_for(&poster_path);

    ItemEditForm {
        watchlist_id: item.watchlist_id,
        item_id: item.id,
        action: format!("/v2/watchlists/{}/items/{}", item.watchlist_id, item.id),
        item_title: item.title.clone(),
        title,
        release_date,
        poster_path,
        poster_preview_url,
        error: Some(failure.message().into()),
        invalid_field: failure.invalid_field(),
    }
}

fn retained_value(submitted: &RawField, stored: &str) -> String {
    match submitted {
        RawField::Omitted => stored.to_owned(),
        RawField::Null => String::new(),
        RawField::Value(value) => value.clone(),
    }
}

fn preview_url_for(poster_path: &str) -> Option<String> {
    PosterPath::parse(poster_path)
        .ok()
        .map(|parsed| parsed.preview_url())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_item() -> WatchlistItem {
        WatchlistItem {
            id: 101,
            watchlist_id: 41,
            tmdb_id: "movie-1".into(),
            source: "tmdb".into(),
            media_type: "movie".into(),
            title: "Stored Movie".into(),
            parent_id: None,
            parent_title: None,
            season: None,
            episode: None,
            poster_path: Some("/stored-poster.jpg".into()),
            release_date: Some("2024-01-01".into()),
            vote_average: None,
            runtime: None,
            custom_rank: Some(7),
            is_watched: false,
            authors: None,
            added_at: "2024-01-01 00:00:00".into(),
        }
    }

    fn value(text: &str) -> RawField {
        RawField::Value(text.to_owned())
    }

    #[test]
    fn for_item_builds_safe_preview_url_for_provider_and_https_posters() {
        let item = sample_item();
        let form = ItemEditForm::for_item(&item);
        assert_eq!(form.action, "/v2/watchlists/41/items/101");
        assert_eq!(
            form.poster_preview_url.as_deref(),
            Some("https://image.tmdb.org/t/p/w500/stored-poster.jpg")
        );

        let mut https_item = sample_item();
        https_item.poster_path = Some("https://images.example.com/custom.jpg".into());
        assert_eq!(
            ItemEditForm::for_item(&https_item)
                .poster_preview_url
                .as_deref(),
            Some("https://images.example.com/custom.jpg")
        );

        let mut unsafe_item = sample_item();
        unsafe_item.poster_path = Some("http://insecure.example.com/poster.jpg".into());
        assert_eq!(
            ItemEditForm::for_item(&unsafe_item).poster_preview_url,
            None
        );
    }

    #[test]
    fn form_encoding_maps_empty_optional_fields_to_clear() {
        let item = sample_item();
        let changes = submit(
            &item,
            &ItemEditInput {
                title: value("  Trimmed  "),
                release_date: value(""),
                poster_path: value(""),
                encoding: ItemEditEncoding::Form,
            },
        )
        .unwrap();
        assert_eq!(changes.watchlist_id(), 41);
        assert_eq!(changes.item_id(), 101);
    }

    #[test]
    fn json_encoding_rejects_empty_string_optional_fields_and_clears_on_null() {
        let item = sample_item();
        let empty_date = submit(
            &item,
            &ItemEditInput {
                title: RawField::Omitted,
                release_date: value(""),
                poster_path: RawField::Omitted,
                encoding: ItemEditEncoding::Json,
            },
        )
        .unwrap_err();
        assert_eq!(
            empty_date.failure,
            ItemEditFailure::Validation(
                "Release date must be YYYY or YYYY-MM-DD.",
                Some(ItemInvalidField::ReleaseDate),
            )
        );
        assert!(empty_date.form.release_date_invalid());

        let empty_poster = submit(
            &item,
            &ItemEditInput {
                title: RawField::Omitted,
                release_date: RawField::Omitted,
                poster_path: value(""),
                encoding: ItemEditEncoding::Json,
            },
        )
        .unwrap_err();
        assert_eq!(
            empty_poster.failure,
            ItemEditFailure::Validation(
                "Poster image must be an HTTPS URL or a provider path beginning with /.",
                Some(ItemInvalidField::PosterPath),
            )
        );
        assert!(empty_poster.form.poster_invalid());

        assert!(
            submit(
                &item,
                &ItemEditInput {
                    title: RawField::Omitted,
                    release_date: RawField::Null,
                    poster_path: RawField::Null,
                    encoding: ItemEditEncoding::Json,
                },
            )
            .is_ok()
        );
    }

    #[test]
    fn validation_failure_preserves_submitted_drafts_and_omits_unsafe_preview() {
        let item = sample_item();
        let rejection = submit(
            &item,
            &ItemEditInput {
                title: value("Draft title"),
                release_date: value("2025"),
                poster_path: value("http://images.example.com/poster.jpg"),
                encoding: ItemEditEncoding::Form,
            },
        )
        .unwrap_err();
        assert_eq!(rejection.failure.code(), "validation_error");
        assert_eq!(rejection.form.title, "Draft title");
        assert_eq!(rejection.form.release_date, "2025");
        assert_eq!(
            rejection.form.poster_path,
            "http://images.example.com/poster.jpg"
        );
        assert_eq!(rejection.form.poster_preview_url, None);
        assert!(rejection.form.poster_invalid());
        assert!(!rejection.form.title_invalid());
    }

    #[test]
    fn rejects_empty_patch_and_blank_or_null_title() {
        let item = sample_item();
        let empty = submit(
            &item,
            &ItemEditInput {
                title: RawField::Omitted,
                release_date: RawField::Omitted,
                poster_path: RawField::Omitted,
                encoding: ItemEditEncoding::Json,
            },
        )
        .unwrap_err();
        assert_eq!(
            empty.failure,
            ItemEditFailure::Validation("No fields to update.", None)
        );

        let blank = submit(
            &item,
            &ItemEditInput {
                title: value("   "),
                release_date: RawField::Omitted,
                poster_path: RawField::Omitted,
                encoding: ItemEditEncoding::Form,
            },
        )
        .unwrap_err();
        assert_eq!(
            blank.failure,
            ItemEditFailure::Validation("Title is required.", Some(ItemInvalidField::Title))
        );
        assert_eq!(blank.form.title, "   ");
        assert!(blank.form.title_invalid());

        let null_title = submit(
            &item,
            &ItemEditInput {
                title: RawField::Null,
                release_date: RawField::Omitted,
                poster_path: RawField::Omitted,
                encoding: ItemEditEncoding::Json,
            },
        )
        .unwrap_err();
        assert_eq!(
            null_title.failure,
            ItemEditFailure::Validation("Title is required.", Some(ItemInvalidField::Title))
        );
        assert_eq!(null_title.form.title, "");
    }

    #[test]
    fn internal_rejection_retains_drafts_and_matches_v1_error_message() {
        let item = sample_item();
        let rejection = rejected(
            &item,
            &ItemEditInput {
                title: value("Edited"),
                release_date: RawField::Null,
                poster_path: value("/replacement.jpg"),
                encoding: ItemEditEncoding::Form,
            },
            ItemEditFailure::Internal,
        );
        assert_eq!(rejection.failure.code(), "internal_error");
        assert_eq!(
            rejection.form.error.as_deref(),
            Some("Failed to save changes. Please try again.")
        );
        assert_eq!(rejection.form.title, "Edited");
        assert_eq!(rejection.form.release_date, "");
        assert_eq!(rejection.form.poster_path, "/replacement.jpg");
        assert_eq!(
            rejection.form.poster_preview_url.as_deref(),
            Some("https://image.tmdb.org/t/p/w500/replacement.jpg")
        );
    }
}
