//! Watchlist home and search presentation.
//!
//! One feature-owned transformation turns typed summaries into the home grid:
//! ordering, Unicode name search, continuation cursors, lifecycle sections and
//! the card labels v1 showed. Web responses only choose the full page or the
//! search fragment; they do not re-implement these rules.

use super::{WatchlistItem, WatchlistSummary};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

const PAGE_SIZE: usize = 50;
const TMDB_POSTER_PREFIX: &str = "https://image.tmdb.org/t/p/w500/";

/// Summary ordering offered by the watchlist home.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BrowseOrder {
    #[default]
    Recency,
    CreatedAt,
    LastWatched,
    LastAdded,
}

impl BrowseOrder {
    /// Reads a stored web parameter, falling back to the v1 home order.
    pub fn parse(value: Option<&str>) -> Self {
        match value {
            Some("createdAt") => Self::CreatedAt,
            Some("lastWatched") => Self::LastWatched,
            Some("lastAdded") => Self::LastAdded,
            _ => Self::Recency,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Recency => "recency",
            Self::CreatedAt => "createdAt",
            Self::LastWatched => "lastWatched",
            Self::LastAdded => "lastAdded",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Recency => "Watch Now order",
            Self::CreatedAt => "Newest first",
            Self::LastWatched => "Recently watched",
            Self::LastAdded => "Recently added",
        }
    }
}

/// Sort direction accepted from the web.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BrowseDirection {
    #[default]
    Asc,
    Desc,
}

impl BrowseDirection {
    /// Reads a stored direction, falling back to the ordering's v1 default.
    pub fn parse(value: Option<&str>, order: BrowseOrder) -> Self {
        match value {
            Some("asc") => Self::Asc,
            Some("desc") => Self::Desc,
            _ if order == BrowseOrder::Recency => Self::Asc,
            _ => Self::Desc,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        }
    }
}

/// Normalized home inputs shared by the full page and search fragment.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BrowseFilters {
    pub query: String,
    pub order_by: BrowseOrder,
    pub direction: BrowseDirection,
    pub cursor: Option<String>,
}

/// A rejected browse continuation.
#[derive(Debug)]
pub enum BrowseError {
    InvalidCursor,
}

impl std::fmt::Display for BrowseError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Invalid watchlist cursor.")
    }
}

impl std::error::Error for BrowseError {}

/// One rendered section of the home grid.
#[derive(Debug)]
pub struct BrowseSection {
    pub title: Option<&'static str>,
    pub collapsible: bool,
    pub cards: Vec<BrowseCard>,
}

/// One watchlist summary card with v1 display labels.
#[derive(Debug)]
pub struct BrowseCard {
    pub id: i64,
    pub name: String,
    pub watched: usize,
    pub total: usize,
    pub progress: u64,
    pub complete: bool,
    pub show_progress: bool,
    pub cover: String,
    pub cover_is_episode: bool,
    pub next_label: Option<String>,
    pub paused_since: Option<String>,
}

/// One sort option in the search form.
#[derive(Debug)]
pub struct BrowseOrderOption {
    pub value: &'static str,
    pub label: &'static str,
    pub selected: bool,
}

/// A complete home or search result, ready for the template.
#[derive(Debug)]
pub struct BrowseView {
    pub query: String,
    pub heading: &'static str,
    pub summary: String,
    pub totals: String,
    pub sections: Vec<BrowseSection>,
    pub order_options: Vec<BrowseOrderOption>,
    pub order_param: &'static str,
    pub direction_param: &'static str,
    pub next_cursor: Option<String>,
    pub empty_message: Option<&'static str>,
    pub is_search: bool,
}

impl BrowseView {
    /// Applies ordering, search, grouping and continuation to typed summaries.
    ///
    /// # Errors
    ///
    /// Returns [`BrowseError::InvalidCursor`] when a cursor was made for other
    /// search or ordering inputs.
    pub fn build(
        summaries: &[WatchlistSummary],
        filters: &BrowseFilters,
    ) -> Result<Self, BrowseError> {
        let query = filters.query.trim().to_owned();
        let search = (!query.is_empty()).then(|| folded(&query));
        let mut ordered = summaries.iter().collect::<Vec<_>>();
        ordered.sort_by(|left, right| compare(left, right, filters));
        if let Some(search) = &search {
            ordered.retain(|summary| folded(&summary.watchlist.name).contains(search));
        }
        let total_matches = ordered.len();
        let offset = match &filters.cursor {
            Some(cursor) => decode(cursor, search.as_deref(), filters)?,
            None => 0,
        };
        let page_size = if search.is_some() {
            PAGE_SIZE
        } else {
            total_matches
        };
        let cards = ordered
            .into_iter()
            .skip(offset)
            .take(page_size)
            .map(card)
            .collect::<Vec<_>>();
        let next_cursor = (offset.saturating_add(page_size) < total_matches)
            .then(|| encode(offset.saturating_add(page_size), &search, filters))
            .transpose()?;
        let sections = if search.is_some() {
            single_section(cards)
        } else {
            lifecycle_sections(cards)
        };
        Ok(Self {
            summary: summary_line(&query, total_matches, summaries.len()),
            totals: totals_line(summaries),
            query,
            heading: if search.is_some() {
                "Search results"
            } else {
                "Watchlists"
            },
            sections,
            order_options: order_options(filters.order_by),
            order_param: filters.order_by.as_str(),
            direction_param: filters.direction.as_str(),
            next_cursor,
            empty_message: (total_matches == 0).then_some(if search.is_some() {
                "No watchlists match your search."
            } else {
                "No watchlists yet."
            }),
            is_search: search.is_some(),
        })
    }
}

fn order_options(selected: BrowseOrder) -> Vec<BrowseOrderOption> {
    [
        BrowseOrder::Recency,
        BrowseOrder::CreatedAt,
        BrowseOrder::LastWatched,
        BrowseOrder::LastAdded,
    ]
    .into_iter()
    .map(|order| BrowseOrderOption {
        value: order.as_str(),
        label: order.label(),
        selected: order == selected,
    })
    .collect()
}

fn summary_line(query: &str, matches: usize, total: usize) -> String {
    if query.is_empty() {
        return String::new();
    }
    format!(
        "{matches} of {total} watchlist{}",
        if total == 1 { "" } else { "s" }
    )
}

fn totals_line(summaries: &[WatchlistSummary]) -> String {
    let watchlists = summaries.len();
    let items = summaries
        .iter()
        .map(|summary| summary.stats.total_items)
        .sum::<usize>();
    format!(
        "{watchlists} watchlist{}, {items} item{}",
        if watchlists == 1 { "" } else { "s" },
        if items == 1 { "" } else { "s" }
    )
}

fn single_section(cards: Vec<BrowseCard>) -> Vec<BrowseSection> {
    (!cards.is_empty())
        .then_some(BrowseSection {
            title: None,
            collapsible: false,
            cards,
        })
        .into_iter()
        .collect()
}

fn lifecycle_sections(cards: Vec<BrowseCard>) -> Vec<BrowseSection> {
    let (rotation, completed, empty, paused) = cards.into_iter().fold(
        (Vec::new(), Vec::new(), Vec::new(), Vec::new()),
        |(mut rotation, mut completed, mut empty, mut paused), card| {
            if card.total == 0 {
                empty.push(card);
            } else if card.complete {
                completed.push(card);
            } else if card.paused_since.is_some() {
                paused.push(card);
            } else {
                rotation.push(card);
            }
            (rotation, completed, empty, paused)
        },
    );
    let groups = [
        ("Watchlists", false, rotation),
        ("Completed", true, completed),
        ("Empty", true, empty),
        ("Paused", true, paused),
    ];
    groups
        .into_iter()
        .filter(|(_, _, cards)| !cards.is_empty())
        .map(|(title, collapsible, cards)| BrowseSection {
            title: Some(title),
            collapsible,
            cards,
        })
        .collect()
}

fn card(summary: &WatchlistSummary) -> BrowseCard {
    let stats = &summary.stats;
    let cover = stats.cover_image.as_deref().unwrap_or_default();
    BrowseCard {
        id: summary.watchlist.id,
        name: summary.watchlist.name.clone(),
        watched: stats.watched_items,
        total: stats.total_items,
        progress: stats.progress,
        complete: stats.total_items > 0 && stats.watched_items == stats.total_items,
        show_progress: stats.watched_items > 0,
        cover: poster(cover),
        cover_is_episode: stats.cover_media_type.as_deref() == Some("episode"),
        next_label: stats.next_unwatched.as_ref().map(next_label),
        paused_since: summary.watchlist.paused_at.as_deref().map(paused_date),
    }
}

fn next_label(item: &WatchlistItem) -> String {
    let episode = item
        .episode
        .as_deref()
        .filter(|episode| !episode.is_empty());
    let Some(episode) = episode else {
        return item.title.clone();
    };
    if !["episode", "anime"].contains(&item.media_type.as_str()) {
        return format!("{episode} • {}", item.title);
    }
    let marker = match (item.source.as_str(), item.season) {
        ("custom", _) => episode.to_owned(),
        (_, Some(season)) => format!("S{season}:E{episode}"),
        (_, None) => format!("E{episode}"),
    };
    format!("{marker} • {}", item.title)
}

fn paused_date(value: &str) -> String {
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let date = value.split(['T', ' ']).next().unwrap_or(value);
    let mut parts = date.split('-');
    let (Some(year), Some(month), Some(day)) = (parts.next(), parts.next(), parts.next()) else {
        return value.to_owned();
    };
    let (Ok(month), Ok(day)) = (month.parse::<usize>(), day.parse::<u32>()) else {
        return value.to_owned();
    };
    let Some(name) = month.checked_sub(1).and_then(|month| MONTHS.get(month)) else {
        return value.to_owned();
    };
    format!("{name} {day}, {year}")
}

fn poster(path: &str) -> String {
    if path.is_empty() {
        String::new()
    } else if path.starts_with("https://") || path.starts_with("http://") {
        path.into()
    } else {
        format!("{TMDB_POSTER_PREFIX}{}", path.trim_start_matches('/'))
    }
}

fn compare(
    left: &WatchlistSummary,
    right: &WatchlistSummary,
    filters: &BrowseFilters,
) -> std::cmp::Ordering {
    let descending = filters.direction == BrowseDirection::Desc;
    let (left_value, right_value) = match filters.order_by {
        BrowseOrder::Recency => return compare_recency(left, right),
        BrowseOrder::CreatedAt => (
            Some(left.watchlist.created_at.as_str()),
            Some(right.watchlist.created_at.as_str()),
        ),
        BrowseOrder::LastWatched => (
            left.watchlist.last_watched_at.as_deref(),
            right.watchlist.last_watched_at.as_deref(),
        ),
        BrowseOrder::LastAdded => (
            Some(
                left.watchlist
                    .last_item_added_at
                    .as_deref()
                    .unwrap_or(&left.watchlist.created_at),
            ),
            Some(
                right
                    .watchlist
                    .last_item_added_at
                    .as_deref()
                    .unwrap_or(&right.watchlist.created_at),
            ),
        ),
    };
    let left_missing = left_value.is_none();
    let right_missing = right_value.is_none();
    match (descending, left_missing, right_missing) {
        (true, true, false) => return std::cmp::Ordering::Greater,
        (true, false, true) => return std::cmp::Ordering::Less,
        (false, true, false) => return std::cmp::Ordering::Less,
        (false, false, true) => return std::cmp::Ordering::Greater,
        _ => {}
    }
    let value = left_value
        .unwrap_or_default()
        .cmp(right_value.unwrap_or_default());
    let ordered = if descending { value.reverse() } else { value };
    let id = if descending {
        right.watchlist.id.cmp(&left.watchlist.id)
    } else {
        left.watchlist.id.cmp(&right.watchlist.id)
    };
    ordered.then(id)
}

fn compare_recency(left: &WatchlistSummary, right: &WatchlistSummary) -> std::cmp::Ordering {
    left.watchlist
        .last_watched_at
        .is_some()
        .cmp(&right.watchlist.last_watched_at.is_some())
        .then_with(|| {
            left.watchlist
                .last_watched_at
                .cmp(&right.watchlist.last_watched_at)
        })
        .then_with(|| left.watchlist.created_at.cmp(&right.watchlist.created_at))
        .then_with(|| left.watchlist.id.cmp(&right.watchlist.id))
}

#[derive(Deserialize, Serialize)]
struct Cursor {
    offset: usize,
    order_by: String,
    order: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    search: Option<String>,
}

fn decode(
    cursor: &str,
    search: Option<&str>,
    filters: &BrowseFilters,
) -> Result<usize, BrowseError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| BrowseError::InvalidCursor)?;
    let cursor: Cursor = serde_json::from_slice(&bytes).map_err(|_| BrowseError::InvalidCursor)?;
    let matches = cursor.order_by == filters.order_by.as_str()
        && cursor.order == filters.direction.as_str()
        && cursor.search.as_deref() == search;
    if !matches {
        return Err(BrowseError::InvalidCursor);
    }
    Ok(cursor.offset)
}

fn encode(
    offset: usize,
    search: &Option<String>,
    filters: &BrowseFilters,
) -> Result<String, BrowseError> {
    let cursor = Cursor {
        offset,
        order_by: filters.order_by.as_str().to_owned(),
        order: filters.direction.as_str().to_owned(),
        search: search.clone(),
    };
    serde_json::to_vec(&cursor)
        .map(|bytes| URL_SAFE_NO_PAD.encode(bytes))
        .map_err(|_| BrowseError::InvalidCursor)
}

fn folded(value: &str) -> String {
    value.nfc().collect::<String>().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::watchlists::{ItemOrderMode, WatchlistRecord, WatchlistStats};

    fn item(
        episode: Option<&str>,
        season: Option<i64>,
        source: &str,
        media: &str,
    ) -> WatchlistItem {
        WatchlistItem {
            id: 1,
            watchlist_id: 1,
            tmdb_id: "entry-1".into(),
            source: source.into(),
            media_type: media.into(),
            title: "Episode title".into(),
            parent_id: None,
            parent_title: None,
            season,
            episode: episode.map(str::to_owned),
            poster_path: None,
            release_date: None,
            vote_average: None,
            runtime: None,
            custom_rank: None,
            is_watched: None,
            authors: None,
            added_at: "2020-01-01 00:00:00".into(),
        }
    }

    fn summary(
        id: i64,
        name: &str,
        created: &str,
        last_watched: Option<&str>,
        paused: bool,
        total: usize,
        watched: usize,
    ) -> WatchlistSummary {
        WatchlistSummary {
            watchlist: WatchlistRecord {
                id,
                name: name.into(),
                description: None,
                item_order_mode: ItemOrderMode::Release,
                created_at: created.into(),
                updated_at: None,
                last_watched_at: last_watched.map(str::to_owned),
                last_item_added_at: None,
                paused_at: paused.then(|| "2021-01-05T00:00:00.000Z".into()),
            },
            stats: WatchlistStats {
                total_items: total,
                watched_items: watched,
                progress: if total == 0 {
                    0
                } else if total == watched {
                    100
                } else {
                    50
                },
                next_unwatched: None,
                cover_image: Some("/poster.jpg".into()),
                cover_media_type: Some("movie".into()),
            },
        }
    }

    fn filters() -> BrowseFilters {
        BrowseFilters::default()
    }

    #[test]
    fn home_orders_by_v1_recency_and_groups_lifecycle_sections() {
        let summaries = vec![
            summary(1, "Watched", "2020-01-03", Some("2020-01-05"), false, 2, 1),
            summary(2, "Paused", "2020-01-01", None, true, 2, 0),
            summary(3, "Empty", "2020-01-02", None, false, 0, 0),
            summary(4, "Done", "2020-01-04", None, false, 2, 2),
        ];
        let view = BrowseView::build(&summaries, &filters()).unwrap();
        let titles = view
            .sections
            .iter()
            .map(|section| (section.title, section.cards.len()))
            .collect::<Vec<_>>();
        assert_eq!(
            titles,
            vec![
                (Some("Watchlists"), 1),
                (Some("Completed"), 1),
                (Some("Empty"), 1),
                (Some("Paused"), 1),
            ]
        );
        assert_eq!(view.sections[0].cards[0].id, 1);
        assert!(view.sections[1].collapsible);
    }

    #[test]
    fn created_at_descending_puts_the_newest_first() {
        let summaries = vec![
            summary(41, "Older", "2020-01-01 12:30:00", None, false, 1, 0),
            summary(42, "Newer", "2026-11-16 21:33:04", None, false, 1, 0),
        ];
        let view = BrowseView::build(
            &summaries,
            &BrowseFilters {
                order_by: BrowseOrder::CreatedAt,
                direction: BrowseDirection::Desc,
                ..filters()
            },
        )
        .unwrap();
        assert_eq!(view.sections[0].cards[0].id, 42);
    }

    #[test]
    fn search_matches_unicode_names_after_nfc_and_case_folding() {
        let summaries = vec![
            summary(41, "Café 東京", "2020-01-01", None, false, 1, 0),
            summary(42, "ΟΣ", "2020-01-02", None, false, 1, 0),
        ];
        let view = BrowseView::build(
            &summaries,
            &BrowseFilters {
                query: "CAFE\u{301}".into(),
                ..filters()
            },
        )
        .unwrap();
        assert_eq!(view.sections[0].cards.len(), 1);
        assert_eq!(view.sections[0].cards[0].id, 41);
        assert_eq!(view.summary, "1 of 2 watchlists");
    }

    #[test]
    fn search_pages_with_a_bound_cursor() {
        let summaries = (1..=51)
            .map(|id| summary(id, &format!("List {id}"), "2020-01-01", None, false, 1, 0))
            .collect::<Vec<_>>();
        let first = BrowseView::build(
            &summaries,
            &BrowseFilters {
                query: "list".into(),
                ..filters()
            },
        )
        .unwrap();
        assert_eq!(first.sections[0].cards.len(), 50);
        let cursor = first.next_cursor.unwrap();
        let second = BrowseView::build(
            &summaries,
            &BrowseFilters {
                query: "list".into(),
                cursor: Some(cursor.clone()),
                ..filters()
            },
        )
        .unwrap();
        assert_eq!(second.sections[0].cards.len(), 1);
        assert!(second.next_cursor.is_none());
        assert!(
            BrowseView::build(
                &summaries,
                &BrowseFilters {
                    query: "other".into(),
                    cursor: Some(cursor),
                    ..filters()
                },
            )
            .is_err()
        );
    }

    #[test]
    fn card_labels_match_v1_next_item_and_paused_dates() {
        let mut summaries = vec![summary(1, "List", "2020-01-01", None, true, 2, 1)];
        summaries[0].stats.next_unwatched = Some(item(Some("3"), Some(2), "tmdb", "episode"));
        let view = BrowseView::build(&summaries, &filters()).unwrap();
        let card = &view.sections[0].cards[0];
        assert_eq!(card.next_label.as_deref(), Some("S2:E3 • Episode title"));
        assert_eq!(card.paused_since.as_deref(), Some("January 5, 2021"));
        assert_eq!(card.cover, "https://image.tmdb.org/t/p/w500/poster.jpg");
        assert!(!card.cover_is_episode);
        assert!(card.show_progress);
    }

    #[test]
    fn next_item_markers_cover_custom_and_seasonless_episodes() {
        assert_eq!(
            next_label(&item(Some("7"), Some(1), "custom", "episode")),
            "7 • Episode title"
        );
        assert_eq!(
            next_label(&item(Some("7"), None, "tmdb", "anime")),
            "E7 • Episode title"
        );
        assert_eq!(
            next_label(&item(Some("7"), None, "tmdb", "movie")),
            "7 • Episode title"
        );
    }
}
