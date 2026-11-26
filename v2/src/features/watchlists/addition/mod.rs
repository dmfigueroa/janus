//! Watchlist addition. Destination checks and provider HTTP finish before the
//! SQLite write transaction opens. Television expansion is still a stub.

mod destination;
mod movie;
mod order;
mod persist;
mod request;
mod television;

use crate::features::search::DEPRECATED_MEDIA_MESSAGE;
use crate::integrations::tmdb::{TmdbCatalog, TmdbFailure};
use sea_orm::DbErr;

use super::Watchlists;

pub use destination::{DestinationFailure, InsertionPosition, validate_addition_destination};
pub use request::{InsertionIntent, MediaAddition, ProviderConfig};

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

/// Adds one parsed provider item.
///
/// The watchlist mode is checked before any provider call. Movie metadata is
/// fetched only after that check and the duplicate read, and the write
/// transaction opens after the fetch returns.
pub async fn add_provider_media(
    lists: &Watchlists,
    catalog: &dyn TmdbCatalog,
    config: &ProviderConfig,
    addition: &MediaAddition,
) -> WatchlistWriteResult {
    let mode = match persist::order_mode(lists, addition.watchlist_id()).await {
        Ok(mode) => mode,
        Err(error) => return internal_error(error),
    };
    if let Err(failure) = validate_addition_destination(mode, addition.insertion().position) {
        return from_destination(failure);
    }
    match addition {
        MediaAddition::Movie {
            watchlist_id,
            tmdb_id,
            insertion,
        } => movie::add_movie(lists, catalog, *watchlist_id, *tmdb_id, insertion).await,
        MediaAddition::Television {
            watchlist_id,
            show_id,
            title,
            insertion,
        } => television::add_show(lists, catalog, *watchlist_id, *show_id, title, insertion).await,
        MediaAddition::Episode {
            watchlist_id,
            episode_id,
            show_id,
            show_title,
            insertion,
        } => {
            television::add_episode(
                lists,
                catalog,
                *watchlist_id,
                *episode_id,
                *show_id,
                show_title.as_deref(),
                insertion,
            )
            .await
        }
        MediaAddition::Game { .. } => stub_provider(config.rawg, StubKind::Rawg),
        MediaAddition::Book { .. } => stub_provider(config.google_books, StubKind::GoogleBooks),
        MediaAddition::Comic { .. } => stub_provider(config.comicvine, StubKind::ComicVine),
        MediaAddition::Deprecated { .. } => WatchlistWriteResult::failed(
            WriteFailure::Unsupported,
            format!(
                "{DEPRECATED_MEDIA_MESSAGE} New anime and manga items cannot be added to watchlists."
            ),
        ),
    }
}

enum StubKind {
    Rawg,
    GoogleBooks,
    ComicVine,
}

fn stub_provider(configured: bool, kind: StubKind) -> WatchlistWriteResult {
    if !configured {
        let message = match kind {
            StubKind::Rawg => {
                "Game additions are unavailable because the RAWG integration is not configured."
            }
            StubKind::GoogleBooks => {
                "Google Books additions are unavailable because the integration is not configured."
            }
            StubKind::ComicVine => {
                "Comic additions are unavailable because the ComicVine integration is not configured."
            }
        };
        return WatchlistWriteResult::failed(WriteFailure::ProviderNotConfigured, message);
    }
    let message = match kind {
        StubKind::Rawg => "RAWG is temporarily unavailable. Please try again later.",
        StubKind::GoogleBooks => "Google Books is temporarily unavailable. Please try again later.",
        StubKind::ComicVine => "ComicVine is temporarily unavailable. Please try again later.",
    };
    WatchlistWriteResult::failed(WriteFailure::ProviderUnavailable, message)
}

fn from_destination(failure: DestinationFailure) -> WatchlistWriteResult {
    let code = match failure {
        DestinationFailure::NotFound => WriteFailure::NotFound,
        DestinationFailure::InsertionChoiceRequired => WriteFailure::InsertionChoiceRequired,
        DestinationFailure::NotCustomMode => WriteFailure::NotCustomMode,
    };
    WatchlistWriteResult::failed(code, failure.message())
}

fn tmdb_failure(failure: TmdbFailure) -> WatchlistWriteResult {
    match failure {
        TmdbFailure::NotConfigured => WatchlistWriteResult::failed(
            WriteFailure::ProviderNotConfigured,
            "TMDB additions are unavailable because the integration is not configured.",
        ),
        TmdbFailure::Unavailable => WatchlistWriteResult::failed(
            WriteFailure::ProviderUnavailable,
            "TMDB is temporarily unavailable. Please try again later.",
        ),
    }
}

fn internal_error(_error: DbErr) -> WatchlistWriteResult {
    WatchlistWriteResult::failed(
        WriteFailure::InternalError,
        "The addition failed unexpectedly.",
    )
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
