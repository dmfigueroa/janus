//! Media search outcomes shared by the web page and `search_media`.
//!
//! Query and page normalization, deprecated categories, and the four outcome
//! statuses live here. Provider HTTP stays in `integrations::tmdb`.

/// Shown when the trimmed query is empty. No provider is contacted.
pub const EMPTY_QUERY_MESSAGE: &str = "Enter a search term to find media.";

/// Shown when a provider cannot answer, including kinds this slice does not call.
pub const PROVIDER_UNAVAILABLE_MESSAGE: &str =
    "Search is temporarily unavailable for this media type. Please try again later.";

/// v1's authoritative copy for anime and manga search.
pub const DEPRECATED_MEDIA_MESSAGE: &str =
    "Anime and manga categories are deprecated while we revisit provider data quality.";

/// Categories the search contract accepts. Anime and manga stay in the enum and
/// are rejected before any provider call.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SearchableMediaType {
    Movie,
    Tv,
    Game,
    Book,
    Comic,
    Anime,
    Manga,
}

impl SearchableMediaType {
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "movie" => Self::Movie,
            "tv" => Self::Tv,
            "game" => Self::Game,
            "book" => Self::Book,
            "comic" => Self::Comic,
            "anime" => Self::Anime,
            "manga" => Self::Manga,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Movie => "movie",
            Self::Tv => "tv",
            Self::Game => "game",
            Self::Book => "book",
            Self::Comic => "comic",
            Self::Anime => "anime",
            Self::Manga => "manga",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Movie => "Movies",
            Self::Tv => "TV",
            Self::Game => "Games",
            Self::Book => "Books",
            Self::Comic => "Comics",
            Self::Anime => "Anime",
            Self::Manga => "Manga",
        }
    }

    pub fn is_deprecated(self) -> bool {
        matches!(self, Self::Anime | Self::Manga)
    }

    /// Tabs v1 renders. Anime and manga are reachable only by an explicit type.
    pub fn tabs() -> &'static [Self] {
        &[Self::Movie, Self::Tv, Self::Game, Self::Book, Self::Comic]
    }
}

/// Provider identity stored on a search hit and echoed by MCP.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaProvider {
    Tmdb,
    Rawg,
    GoogleBooks,
    Comicvine,
    Anilist,
}

impl MediaProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tmdb => "tmdb",
            Self::Rawg => "rawg",
            Self::GoogleBooks => "google_books",
            Self::Comicvine => "comicvine",
            Self::Anilist => "anilist",
        }
    }
}

/// One search hit in the shape MCP and the detail sheet share.
#[derive(Clone, Debug, PartialEq)]
pub struct UnifiedMedia {
    pub provider: MediaProvider,
    pub id: String,
    pub media_type: SearchableMediaType,
    pub title: String,
    pub release_date: Option<String>,
    pub year: Option<String>,
    pub overview: Option<String>,
    pub poster: Option<String>,
    pub backdrop: Option<String>,
    pub rating: Option<f64>,
}

/// The four search statuses. Messages are the constants above, not free text.
#[derive(Clone, Debug, PartialEq)]
pub enum MediaSearchOutcome {
    Results {
        results: Vec<UnifiedMedia>,
        page: u32,
        total_pages: u32,
        total_results: u32,
    },
    EmptyQuery {
        page: u32,
    },
    DeprecatedMediaType {
        page: u32,
    },
    ProviderUnavailable {
        page: u32,
    },
}

impl MediaSearchOutcome {
    pub fn status(&self) -> &'static str {
        match self {
            Self::Results { .. } => "ok",
            Self::EmptyQuery { .. } => "empty_query",
            Self::DeprecatedMediaType { .. } => "deprecated_media_type",
            Self::ProviderUnavailable { .. } => "provider_unavailable",
        }
    }

    pub fn page(&self) -> u32 {
        match self {
            Self::Results { page, .. }
            | Self::EmptyQuery { page }
            | Self::DeprecatedMediaType { page }
            | Self::ProviderUnavailable { page } => *page,
        }
    }

    pub fn message(&self) -> Option<&'static str> {
        match self {
            Self::Results { .. } => None,
            Self::EmptyQuery { .. } => Some(EMPTY_QUERY_MESSAGE),
            Self::DeprecatedMediaType { .. } => Some(DEPRECATED_MEDIA_MESSAGE),
            Self::ProviderUnavailable { .. } => Some(PROVIDER_UNAVAILABLE_MESSAGE),
        }
    }
}

/// Trimmed query. An empty result is `empty_query` and does not call a provider.
pub fn normalize_query(query: &str) -> String {
    query.trim().to_owned()
}

/// v1's `Math.max(1, Math.trunc(page))` for a finite integer page.
pub fn normalize_page(page: i64) -> u32 {
    if page < 1 {
        1
    } else {
        u32::try_from(page).unwrap_or(u32::MAX)
    }
}

/// Local rejections that happen before a provider call. `None` means search.
pub fn local_rejection(
    query: &str,
    media_type: SearchableMediaType,
    page: u32,
) -> Option<MediaSearchOutcome> {
    if query.is_empty() {
        return Some(MediaSearchOutcome::EmptyQuery { page });
    }
    if media_type.is_deprecated() {
        return Some(MediaSearchOutcome::DeprecatedMediaType { page });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_query_wins_over_a_deprecated_type() {
        let outcome = local_rejection("", SearchableMediaType::Anime, normalize_page(0)).unwrap();
        assert_eq!(outcome.status(), "empty_query");
        assert_eq!(outcome.page(), 1);
        assert_eq!(outcome.message(), Some(EMPTY_QUERY_MESSAGE));
    }

    #[test]
    fn deprecated_types_keep_their_message() {
        let outcome = local_rejection("naruto", SearchableMediaType::Manga, 2).unwrap();
        assert_eq!(outcome.status(), "deprecated_media_type");
        assert_eq!(outcome.message(), Some(DEPRECATED_MEDIA_MESSAGE));
        assert_eq!(outcome.page(), 2);
    }

    #[test]
    fn active_types_are_not_local_rejections() {
        assert!(local_rejection("dune", SearchableMediaType::Book, 1).is_none());
        assert!(local_rejection("fight", SearchableMediaType::Movie, 1).is_none());
    }

    #[test]
    fn tabs_omit_deprecated_categories() {
        let labels: Vec<_> = SearchableMediaType::tabs()
            .iter()
            .map(|media_type| media_type.label())
            .collect();
        assert_eq!(labels, ["Movies", "TV", "Games", "Books", "Comics"]);
    }
}
