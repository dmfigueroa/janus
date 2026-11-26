//! Addition requests after the HTTP and MCP edges have parsed them.
//!
//! Invalid combinations never reach this enum. Provider configuration is an
//! argument so tests can cover both codes without changing process environment.

use super::destination::InsertionPosition;

/// Where the new rows go, once the caller has paired anchors with a reference.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InsertionIntent {
    pub position: Option<InsertionPosition>,
    pub reference_item_id: Option<i64>,
}

/// One provider addition the write path can execute.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MediaAddition {
    Movie {
        watchlist_id: i64,
        tmdb_id: u64,
        insertion: InsertionIntent,
    },
    Television {
        watchlist_id: i64,
        show_id: u64,
        title: String,
        insertion: InsertionIntent,
    },
    Episode {
        watchlist_id: i64,
        episode_id: u64,
        show_id: u64,
        show_title: Option<String>,
        insertion: InsertionIntent,
    },
    Game {
        watchlist_id: i64,
        insertion: InsertionIntent,
    },
    Book {
        watchlist_id: i64,
        insertion: InsertionIntent,
    },
    Comic {
        watchlist_id: i64,
        insertion: InsertionIntent,
    },
    Deprecated {
        watchlist_id: i64,
        insertion: InsertionIntent,
    },
}

impl MediaAddition {
    pub(super) fn watchlist_id(&self) -> i64 {
        match self {
            Self::Movie { watchlist_id, .. }
            | Self::Television { watchlist_id, .. }
            | Self::Episode { watchlist_id, .. }
            | Self::Game { watchlist_id, .. }
            | Self::Book { watchlist_id, .. }
            | Self::Comic { watchlist_id, .. }
            | Self::Deprecated { watchlist_id, .. } => *watchlist_id,
        }
    }

    pub(super) fn insertion(&self) -> &InsertionIntent {
        match self {
            Self::Movie { insertion, .. }
            | Self::Television { insertion, .. }
            | Self::Episode { insertion, .. }
            | Self::Game { insertion, .. }
            | Self::Book { insertion, .. }
            | Self::Comic { insertion, .. }
            | Self::Deprecated { insertion, .. } => insertion,
        }
    }
}

/// Which unimplemented providers have a non-empty API key.
///
/// A present key still does not call that provider. It only selects the
/// outage code instead of the not-configured code.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProviderConfig {
    pub rawg: bool,
    pub google_books: bool,
    pub comicvine: bool,
}

impl ProviderConfig {
    /// Reads `RAWG_API_KEY`, `GOOGLE_BOOKS_API_KEY`, and `COMICVINE_API_KEY`.
    /// An empty value counts as missing. Whitespace counts as present, matching
    /// v1's truthiness check.
    pub fn from_env() -> Self {
        Self {
            rawg: env_present("RAWG_API_KEY"),
            google_books: env_present("GOOGLE_BOOKS_API_KEY"),
            comicvine: env_present("COMICVINE_API_KEY"),
        }
    }
}

fn env_present(name: &str) -> bool {
    std::env::var(name)
        .ok()
        .is_some_and(|value| !value.is_empty())
}
