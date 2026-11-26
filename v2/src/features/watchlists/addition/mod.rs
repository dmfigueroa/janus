//! Watchlist addition outcomes. Destination rules are pure. Persistence and
//! provider calls arrive in later units and stay outside one another's transactions.

mod destination;

pub use destination::{DestinationFailure, InsertionPosition, validate_addition_destination};

/// Success codes that still report `success: true` when nothing new was stored.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WriteSuccess {
    Added,
    Duplicate,
    NoNewItems,
}

impl WriteSuccess {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Added => "added",
            Self::Duplicate => "duplicate",
            Self::NoNewItems => "no_new_items",
        }
    }
}

/// Failure codes from v1 `AdditionOutcome.ts`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WriteFailure {
    NotFound,
    InsertionChoiceRequired,
    NotCustomMode,
    InvalidReference,
    ValidationError,
    Unsupported,
    ProviderUnavailable,
    ProviderNotConfigured,
    InternalError,
}

impl WriteFailure {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotFound => "not_found",
            Self::InsertionChoiceRequired => "insertion_choice_required",
            Self::NotCustomMode => "not_custom_mode",
            Self::InvalidReference => "invalid_reference",
            Self::ValidationError => "validation_error",
            Self::Unsupported => "unsupported",
            Self::ProviderUnavailable => "provider_unavailable",
            Self::ProviderNotConfigured => "provider_not_configured",
            Self::InternalError => "internal_error",
        }
    }
}

/// Authoritative addition result. `affected_count` is 0 unless items were inserted.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WatchlistWriteResult {
    Added {
        message: String,
        affected_count: u32,
    },
    Duplicate {
        message: String,
    },
    NoNewItems {
        message: String,
    },
    Failed {
        code: WriteFailure,
        message: String,
    },
}

impl WatchlistWriteResult {
    pub fn success(&self) -> bool {
        !matches!(self, Self::Failed { .. })
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::Added { .. } => "added",
            Self::Duplicate { .. } => "duplicate",
            Self::NoNewItems { .. } => "no_new_items",
            Self::Failed { code, .. } => code.as_str(),
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Added { message, .. }
            | Self::Duplicate { message }
            | Self::NoNewItems { message }
            | Self::Failed { message, .. } => message,
        }
    }

    pub fn affected_count(&self) -> u32 {
        match self {
            Self::Added { affected_count, .. } => *affected_count,
            _ => 0,
        }
    }

    pub fn failed(code: WriteFailure, message: impl Into<String>) -> Self {
        Self::Failed {
            code,
            message: message.into(),
        }
    }

    /// v1 `addedItemsResult`. A zero count uses `unchanged` instead of `added`.
    pub fn from_count(
        affected_count: u32,
        added_message: impl Into<String>,
        unchanged: Unchanged,
    ) -> Self {
        if affected_count > 0 {
            Self::Added {
                message: added_message.into(),
                affected_count,
            }
        } else {
            match unchanged {
                Unchanged::Duplicate(message) => Self::Duplicate { message },
                Unchanged::NoNewItems(message) => Self::NoNewItems { message },
            }
        }
    }
}

/// Which success code a zero insert uses.
pub enum Unchanged {
    Duplicate(String),
    NoNewItems(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn added_count_selects_the_success_code() {
        let added = WatchlistWriteResult::from_count(
            2,
            "Added to watchlist",
            Unchanged::Duplicate("Already in watchlist".into()),
        );
        assert!(added.success());
        assert_eq!(added.code(), "added");
        assert_eq!(added.affected_count(), 2);

        let duplicate = WatchlistWriteResult::from_count(
            0,
            "Added to watchlist",
            Unchanged::Duplicate("Already in watchlist".into()),
        );
        assert!(duplicate.success());
        assert_eq!(duplicate.code(), "duplicate");
        assert_eq!(duplicate.affected_count(), 0);

        let empty = WatchlistWriteResult::from_count(
            0,
            "Added 0 new episodes to watchlist",
            Unchanged::NoNewItems("No new episodes found for this show".into()),
        );
        assert_eq!(empty.code(), "no_new_items");
        assert_eq!(empty.message(), "No new episodes found for this show");
    }

    #[test]
    fn failures_report_zero_affected_items() {
        let failure = WatchlistWriteResult::failed(WriteFailure::NotFound, "Watchlist not found.");
        assert!(!failure.success());
        assert_eq!(failure.code(), "not_found");
        assert_eq!(failure.affected_count(), 0);
    }
}
