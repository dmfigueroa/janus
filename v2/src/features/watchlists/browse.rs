//! Watchlist home and search presentation.
//!
//! One feature-owned transformation turns typed summaries into the home grid:
//! ordering, Unicode name search, continuation cursors, lifecycle sections and
//! the card labels v1 showed. Web responses only choose the full page or the
//! search fragment; they do not re-implement these rules.

use super::discovery::folded;
use super::{WatchlistItem, WatchlistSummary};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
const PAGE_SIZE: usize = 50;
const TMDB_POSTER_PREFIX: &str = "https://image.tmdb.org/t/p/w500/";

/// Normalized home inputs shared by the full page and search fragment.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BrowseFilters {
    pub query: String,
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
#[derive(Debug, Serialize)]
pub struct BrowseSection {
    pub title: Option<&'static str>,
    pub collapsible: bool,
    pub create_tile: bool,
    pub cards: Vec<BrowseCard>,
}

/// One watchlist summary card with v1 display labels.
#[derive(Debug, Serialize)]
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

/// A complete home or search result, ready for the template.
#[derive(Debug, Serialize)]
pub struct BrowseView {
    pub query: String,
    pub heading: &'static str,
    pub summary: String,
    pub totals: String,
    pub sections: Vec<BrowseSection>,
    pub next_cursor: Option<String>,
    pub empty_message: Option<&'static str>,
    pub is_search: bool,
}

impl BrowseView {
    /// Applies v1 ordering, search, grouping and continuation to typed summaries.
    ///
    /// # Errors
    ///
    /// Returns [`BrowseError::InvalidCursor`] when a cursor was made for another
    /// search input.
    pub fn build(
        summaries: &[WatchlistSummary],
        filters: &BrowseFilters,
    ) -> Result<Self, BrowseError> {
        let query = filters.query.trim().to_owned();
        let search = (!query.is_empty()).then(|| folded(&query));
        let mut ordered = summaries.iter().collect::<Vec<_>>();
        ordered.sort_by(|left, right| compare_recency(left, right));
        if let Some(search) = &search {
            ordered.retain(|summary| folded(&summary.watchlist.name).contains(search));
        }
        let total_matches = ordered.len();
        let offset = match &filters.cursor {
            Some(cursor) => decode(cursor, search.as_deref())?,
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
            .then(|| encode(offset.saturating_add(page_size), &search))
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
            create_tile: true,
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
        ("Watchlists", false, true, rotation),
        ("Completed", true, false, completed),
        ("Empty", true, false, empty),
        ("Paused", true, false, paused),
    ];
    groups
        .into_iter()
        .filter(|(_, _, create_tile, cards)| *create_tile || !cards.is_empty())
        .map(|(title, collapsible, create_tile, cards)| BrowseSection {
            title: Some(title),
            collapsible,
            create_tile,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    search: Option<String>,
}

fn decode(cursor: &str, search: Option<&str>) -> Result<usize, BrowseError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| BrowseError::InvalidCursor)?;
    let cursor: Cursor = serde_json::from_slice(&bytes).map_err(|_| BrowseError::InvalidCursor)?;
    if cursor.search.as_deref() != search {
        return Err(BrowseError::InvalidCursor);
    }
    Ok(cursor.offset)
}

fn encode(offset: usize, search: &Option<String>) -> Result<String, BrowseError> {
    let cursor = Cursor {
        offset,
        search: search.clone(),
    };
    serde_json::to_vec(&cursor)
        .map(|bytes| URL_SAFE_NO_PAD.encode(bytes))
        .map_err(|_| BrowseError::InvalidCursor)
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
            is_watched: false,
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
    fn search_matches_unicode_names_after_nfc_and_case_folding() {
        let summaries = vec![
            summary(41, "Café 東京", "2020-01-01", None, false, 1, 0),
            summary(42, "ΟΣ", "2020-01-02", None, false, 1, 0),
        ];
        let view = BrowseView::build(
            &summaries,
            &BrowseFilters {
                query: "CAFE\u{301}".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(view.sections[0].cards.len(), 1);
        assert_eq!(view.sections[0].cards[0].id, 41);
        assert_eq!(view.summary, "1 of 2 watchlists");
        let greek = BrowseView::build(
            &summaries,
            &BrowseFilters {
                query: "ος".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(greek.sections[0].cards[0].id, 42);
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
                ..Default::default()
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
        let card = view
            .sections
            .iter()
            .flat_map(|section| &section.cards)
            .find(|card| card.id == 1)
            .unwrap();
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
