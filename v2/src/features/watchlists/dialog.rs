//! Watchlist create/edit dialog: validation, retained values and outcomes.
//!
//! Web renders these outcomes through its own transport. MCP keeps a separate
//! normalization and message vocabulary because its externally observable
//! contract is intentionally distinct.

use super::ItemOrderMode;
use super::WatchlistRecord;
use super::write::{NewWatchlist, WatchlistChanges};

/// Display values for the create/edit dialog form.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchlistForm {
    pub mode: &'static str,
    pub watchlist_id: Option<i64>,
    pub action: String,
    pub title: &'static str,
    pub help: &'static str,
    pub submit_label: &'static str,
    pub name: String,
    pub description: String,
    pub item_order_mode: String,
    pub error: Option<String>,
}

impl WatchlistForm {
    pub fn create() -> Self {
        Self {
            mode: "create",
            watchlist_id: None,
            action: "/v2/watchlists".into(),
            title: "Create watchlist",
            help: "Create a new watchlist to track your movies and shows.",
            submit_label: "Create watchlist",
            name: String::new(),
            description: String::new(),
            item_order_mode: "release".into(),
            error: None,
        }
    }

    pub fn name_invalid(&self) -> bool {
        self.error.as_deref() == Some("Name is required")
    }

    pub fn release_selected(&self) -> bool {
        self.item_order_mode == "release"
    }

    pub fn custom_selected(&self) -> bool {
        self.item_order_mode == "custom"
    }

    pub fn missing(id: i64) -> Self {
        Self {
            watchlist_id: Some(id),
            action: format!("/v2/watchlists/{id}"),
            mode: "edit",
            title: "Edit watchlist",
            help: "Update your watchlist details.",
            submit_label: "Save changes",
            name: String::new(),
            description: String::new(),
            item_order_mode: "release".into(),
            error: Some("Watchlist not found.".into()),
        }
    }

    pub fn edit(record: &WatchlistRecord) -> Self {
        Self {
            mode: "edit",
            watchlist_id: Some(record.id),
            action: format!("/v2/watchlists/{}", record.id),
            title: "Edit watchlist",
            help: "Update your watchlist details.",
            submit_label: "Save changes",
            name: record.name.clone(),
            description: record.description.clone().unwrap_or_default(),
            item_order_mode: record.item_order_mode.as_str().into(),
            error: None,
        }
    }
}

/// The dialog a submission belongs to.
#[derive(Clone, Copy)]
pub enum DialogTarget<'a> {
    Create,
    Edit(&'a WatchlistRecord),
}

/// Raw dialog values retained from a form or JSON body.
///
/// An absent field is `None`; a present field is `Some`, and `Some(None)` means
/// the field was sent as `null`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchlistDialogInput {
    pub name: Option<Option<String>>,
    pub description: Option<Option<String>>,
    pub item_order_mode: Option<Option<String>>,
}

/// Why a dialog submission was rejected.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DialogFailure {
    /// The submitted fields are invalid; carries the message shown to the user.
    Validation(&'static str),
    /// The targeted watchlist no longer exists.
    NotFound,
    /// The write failed unexpectedly.
    Internal,
}

impl DialogFailure {
    /// Stable error code shared with API callers.
    pub fn code(self) -> &'static str {
        match self {
            Self::Validation(_) => "validation_error",
            Self::NotFound => "not_found",
            Self::Internal => "internal_error",
        }
    }

    fn message(self, target: DialogTarget<'_>) -> &'static str {
        match self {
            Self::Validation(message) => message,
            Self::NotFound => "Watchlist not found.",
            Self::Internal => match target {
                DialogTarget::Create => "Unable to create watchlist. Please try again.",
                DialogTarget::Edit(_) => "Unable to update watchlist. Please try again.",
            },
        }
    }
}

/// Validated write produced by a dialog submission.
#[derive(Debug)]
pub enum WatchlistMutation {
    Create(NewWatchlist),
    Update(WatchlistChanges),
}

/// A rejected submission together with the values the dialog shows again.
///
/// The form is boxed because rejections are the rare path while holding one
/// would otherwise enlarge every successful submission.
pub struct DialogRejection {
    pub failure: DialogFailure,
    pub form: Box<WatchlistForm>,
}

impl DialogRejection {
    /// Rejection for a watchlist found missing before its form was validated.
    pub fn missing(watchlist_id: i64) -> Self {
        Self {
            failure: DialogFailure::NotFound,
            form: Box::new(WatchlistForm::missing(watchlist_id)),
        }
    }
}

/// Validates a dialog submission against its target.
///
/// # Errors
/// Returns the rejection whose form retains the submitted values, so callers can
/// re-render without rebuilding presentation values.
pub fn submit(
    target: DialogTarget<'_>,
    input: &WatchlistDialogInput,
) -> Result<WatchlistMutation, DialogRejection> {
    match target {
        DialogTarget::Create => create_mutation(input).map(WatchlistMutation::Create),
        DialogTarget::Edit(record) => update_mutation(record, input).map(WatchlistMutation::Update),
    }
    .map_err(|failure| rejected(target, input, failure))
}

/// Builds the rejection for a failure discovered after validation, such as a
/// database error or a watchlist removed between the read and the write.
pub fn rejected(
    target: DialogTarget<'_>,
    input: &WatchlistDialogInput,
    failure: DialogFailure,
) -> DialogRejection {
    DialogRejection {
        failure,
        form: Box::new(retained_form(target, input, failure)),
    }
}

fn create_mutation(input: &WatchlistDialogInput) -> Result<NewWatchlist, DialogFailure> {
    let name = match input.name.as_ref() {
        Some(Some(name)) if !name.trim().is_empty() => name.clone(),
        _ => return Err(DialogFailure::Validation("Name is required")),
    };
    let description = match input.description.clone() {
        None => None,
        Some(Some(description)) => Some(description),
        Some(None) => return Err(DialogFailure::Validation("Invalid description.")),
    };
    let item_order_mode = parse_mode(input.item_order_mode.as_ref().and_then(Option::as_deref))?;
    Ok(NewWatchlist {
        name,
        description,
        item_order_mode,
    })
}

fn update_mutation(
    record: &WatchlistRecord,
    input: &WatchlistDialogInput,
) -> Result<WatchlistChanges, DialogFailure> {
    if input.name.is_none() && input.description.is_none() && input.item_order_mode.is_none() {
        return Err(DialogFailure::Validation("No fields to update."));
    }
    let name = match input.name.as_ref() {
        None => None,
        Some(Some(name)) if !name.trim().is_empty() => Some(name.clone()),
        Some(_) => return Err(DialogFailure::Validation("Name is required")),
    };
    if matches!(input.item_order_mode, Some(None)) {
        return Err(DialogFailure::Validation("Invalid order mode."));
    }
    let item_order_mode = parse_mode(input.item_order_mode.as_ref().and_then(Option::as_deref))?;
    Ok(WatchlistChanges {
        watchlist_id: record.id,
        name,
        description: input.description.clone(),
        item_order_mode,
    })
}

fn parse_mode(value: Option<&str>) -> Result<Option<ItemOrderMode>, DialogFailure> {
    value
        .map(|mode| {
            ItemOrderMode::parse(mode).ok_or(DialogFailure::Validation("Invalid order mode."))
        })
        .transpose()
}

fn retained_form(
    target: DialogTarget<'_>,
    input: &WatchlistDialogInput,
    failure: DialogFailure,
) -> WatchlistForm {
    let error = Some(failure.message(target).into());
    match target {
        DialogTarget::Create => WatchlistForm {
            name: input.name.clone().flatten().unwrap_or_default(),
            description: input.description.clone().flatten().unwrap_or_default(),
            item_order_mode: input
                .item_order_mode
                .clone()
                .flatten()
                .unwrap_or_else(|| "release".into()),
            error,
            ..WatchlistForm::create()
        },
        DialogTarget::Edit(record) => WatchlistForm {
            name: input
                .name
                .clone()
                .flatten()
                .unwrap_or_else(|| record.name.clone()),
            description: input
                .description
                .clone()
                .flatten()
                .unwrap_or_else(|| record.description.clone().unwrap_or_default()),
            item_order_mode: input
                .item_order_mode
                .clone()
                .flatten()
                .unwrap_or_else(|| record.item_order_mode.as_str().into()),
            error,
            ..WatchlistForm::edit(record)
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record() -> WatchlistRecord {
        WatchlistRecord {
            id: 41,
            name: "Stored".into(),
            description: Some("Stored description".into()),
            item_order_mode: ItemOrderMode::Release,
            created_at: "2026-01-01 00:00:00".into(),
            updated_at: None,
            last_watched_at: None,
            last_item_added_at: None,
            paused_at: None,
        }
    }

    fn input(
        name: Option<Option<&str>>,
        description: Option<Option<&str>>,
        item_order_mode: Option<Option<&str>>,
    ) -> WatchlistDialogInput {
        let owned = |value: Option<&str>| value.map(str::to_owned);
        WatchlistDialogInput {
            name: name.map(owned),
            description: description.map(owned),
            item_order_mode: item_order_mode.map(owned),
        }
    }

    #[test]
    fn submit_create_rejects_a_missing_name_and_retains_submitted_values() {
        let input = input(None, Some(Some("Draft description")), Some(Some("custom")));
        let rejection = submit(DialogTarget::Create, &input).unwrap_err();
        assert_eq!(
            rejection.failure,
            DialogFailure::Validation("Name is required")
        );
        assert_eq!(rejection.form.description, "Draft description");
        assert_eq!(rejection.form.item_order_mode, "custom");
        assert_eq!(rejection.form.action, "/v2/watchlists");
    }

    #[test]
    fn submit_create_rejects_a_null_description() {
        let input = input(Some(Some("Name")), Some(None), None);
        let rejection = submit(DialogTarget::Create, &input).unwrap_err();
        assert_eq!(
            rejection.failure,
            DialogFailure::Validation("Invalid description.")
        );
    }

    #[test]
    fn submit_create_treats_a_null_order_mode_as_absent() {
        let input = input(Some(Some("Name")), None, Some(None));
        let Ok(WatchlistMutation::Create(new_watchlist)) = submit(DialogTarget::Create, &input)
        else {
            panic!("expected a create mutation");
        };
        assert_eq!(new_watchlist.item_order_mode, None);
        assert_eq!(new_watchlist.description, None);
    }

    #[test]
    fn submit_create_keeps_the_untrimmed_name_for_storage() {
        let input = input(Some(Some("  Spaced  ")), None, Some(Some("release")));
        let Ok(WatchlistMutation::Create(new_watchlist)) = submit(DialogTarget::Create, &input)
        else {
            panic!("expected a create mutation");
        };
        assert_eq!(new_watchlist.name, "  Spaced  ");
    }

    #[test]
    fn submit_edit_updates_only_submitted_fields() {
        let record = record();
        let input = input(None, Some(Some("New description")), None);
        let Ok(WatchlistMutation::Update(changes)) = submit(DialogTarget::Edit(&record), &input)
        else {
            panic!("expected an update mutation");
        };
        assert_eq!(changes.watchlist_id, 41);
        assert_eq!(changes.name, None);
        assert_eq!(changes.description, Some(Some("New description".into())));
        assert_eq!(changes.item_order_mode, None);
    }

    #[test]
    fn submit_edit_accepts_clearing_the_description() {
        let record = record();
        let input = input(None, Some(None), None);
        let Ok(WatchlistMutation::Update(changes)) = submit(DialogTarget::Edit(&record), &input)
        else {
            panic!("expected an update mutation");
        };
        assert_eq!(changes.description, Some(None));
    }

    #[test]
    fn submit_edit_rejects_an_empty_body_and_retains_record_values() {
        let record = record();
        let rejection = submit(DialogTarget::Edit(&record), &input(None, None, None)).unwrap_err();
        assert_eq!(
            rejection.failure,
            DialogFailure::Validation("No fields to update.")
        );
        assert_eq!(rejection.form.name, "Stored");
        assert_eq!(rejection.form.description, "Stored description");
        assert_eq!(rejection.form.item_order_mode, "release");
        assert_eq!(rejection.form.action, "/v2/watchlists/41");
    }

    #[test]
    fn submit_edit_rejects_a_whitespace_name() {
        let record = record();
        let rejection = submit(
            DialogTarget::Edit(&record),
            &input(Some(Some("  ")), None, None),
        )
        .unwrap_err();
        assert_eq!(
            rejection.failure,
            DialogFailure::Validation("Name is required")
        );
        assert_eq!(rejection.form.name, "  ");
    }

    #[test]
    fn submit_edit_rejects_a_null_order_mode() {
        let record = record();
        let rejection =
            submit(DialogTarget::Edit(&record), &input(None, None, Some(None))).unwrap_err();
        assert_eq!(
            rejection.failure,
            DialogFailure::Validation("Invalid order mode.")
        );
    }

    #[test]
    fn submit_edit_rejects_an_unknown_order_mode() {
        let record = record();
        let rejection = submit(
            DialogTarget::Edit(&record),
            &input(None, None, Some(Some("shuffled"))),
        )
        .unwrap_err();
        assert_eq!(
            rejection.failure,
            DialogFailure::Validation("Invalid order mode.")
        );
    }

    #[test]
    fn edit_rejection_falls_back_to_record_values_for_unsubmitted_fields() {
        let record = record();
        let input = input(Some(Some("")), Some(None), None);
        let rejection = submit(DialogTarget::Edit(&record), &input).unwrap_err();
        assert_eq!(rejection.form.name, "");
        assert_eq!(rejection.form.description, "Stored description");
        assert_eq!(rejection.form.item_order_mode, "release");
    }

    #[test]
    fn rejected_uses_the_create_message_and_code() {
        let rejection = rejected(
            DialogTarget::Create,
            &input(Some(Some("Name")), None, None),
            DialogFailure::Internal,
        );
        assert_eq!(rejection.failure.code(), "internal_error");
        assert_eq!(
            rejection.form.error.as_deref(),
            Some("Unable to create watchlist. Please try again.")
        );
    }

    #[test]
    fn rejected_uses_the_edit_message_for_a_missing_watchlist() {
        let record = record();
        let rejection = rejected(
            DialogTarget::Edit(&record),
            &input(None, None, None),
            DialogFailure::NotFound,
        );
        assert_eq!(rejection.failure.code(), "not_found");
        assert_eq!(
            rejection.form.error.as_deref(),
            Some("Watchlist not found.")
        );
        assert_eq!(rejection.form.watchlist_id, Some(41));
    }

    #[test]
    fn missing_watchlist_rejection_renders_the_edit_dialog() {
        let rejection = DialogRejection::missing(7);
        assert_eq!(rejection.failure.code(), "not_found");
        assert_eq!(rejection.form.watchlist_id, Some(7));
        assert_eq!(rejection.form.mode, "edit");
        assert_eq!(rejection.form.action, "/v2/watchlists/7");
        assert_eq!(
            rejection.form.error.as_deref(),
            Some("Watchlist not found.")
        );
        assert!(!rejection.form.name_invalid());
    }

    #[test]
    fn name_invalid_only_flags_name_validation_errors() {
        let record = record();
        let blank_name = submit(
            DialogTarget::Edit(&record),
            &input(Some(Some("   ")), None, None),
        )
        .unwrap_err();
        assert!(blank_name.form.name_invalid());

        let bad_mode = submit(
            DialogTarget::Edit(&record),
            &input(Some(Some("Valid")), None, Some(Some("shuffled"))),
        )
        .unwrap_err();
        assert!(!bad_mode.form.name_invalid());

        let internal = rejected(
            DialogTarget::Edit(&record),
            &input(Some(Some("Valid")), None, Some(Some("custom"))),
            DialogFailure::Internal,
        );
        assert!(!internal.form.name_invalid());
    }
}
