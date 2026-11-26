//! Derived watchlist state shared by detail snapshots and summary reads.
//!
//! Progress, next unwatched item and poster selection have one implementation
//! here so callers never coordinate those rules themselves.

use super::WatchlistItem;
use super::snapshot::WatchlistRecord;

/// Derived counts, progress, next unwatched item and cover metadata.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchlistStats {
    pub total_items: usize,
    pub watched_items: usize,
    pub progress: u64,
    pub next_unwatched: Option<WatchlistItem>,
    pub cover_image: Option<String>,
    pub cover_media_type: Option<String>,
}

/// A watchlist row plus its derived statistics.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchlistSummary {
    pub watchlist: WatchlistRecord,
    pub stats: WatchlistStats,
}

/// The items selected for a summary, before their values are derived.
pub(super) struct SummarySelection {
    next_unwatched: Option<WatchlistItem>,
    cover_image: Option<String>,
    cover_media_type: Option<String>,
}

impl SummarySelection {
    pub(super) fn new(
        next_unwatched: Option<WatchlistItem>,
        first_item: Option<&WatchlistItem>,
    ) -> Self {
        let cover = next_unwatched.as_ref().or(first_item);
        Self {
            cover_image: cover.and_then(|item| item.poster_path.clone()),
            cover_media_type: cover.map(|item| item.media_type.clone()),
            next_unwatched,
        }
    }
}

/// Builds summary state from stored counts and selected items.
pub(super) fn build_stats(
    total_items: usize,
    watched_items: usize,
    selection: SummarySelection,
) -> WatchlistStats {
    WatchlistStats {
        total_items,
        watched_items,
        progress: progress(total_items, watched_items),
        next_unwatched: selection.next_unwatched,
        cover_image: selection.cover_image,
        cover_media_type: selection.cover_media_type,
    }
}

/// Derives summary state from an already loaded detail item snapshot.
pub(super) fn stats_from_items(items: &[WatchlistItem]) -> WatchlistStats {
    let watched_items = items.iter().filter(|item| item.is_watched).count();
    let next_unwatched = items.iter().find(|item| item.is_unwatched()).cloned();
    build_stats(
        items.len(),
        watched_items,
        SummarySelection::new(next_unwatched, items.first()),
    )
}

fn progress(total_items: usize, watched_items: usize) -> u64 {
    if total_items == 0 {
        0
    } else if total_items == watched_items {
        100
    } else {
        let percentage = (watched_items as f64 / total_items as f64 * 100.0).round();
        // Completed lists report 100 above; partial lists stay below it.
        percentage.min(99.0) as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: i64, watched: bool, poster: Option<&str>, media: &str) -> WatchlistItem {
        WatchlistItem {
            id,
            watchlist_id: 1,
            tmdb_id: format!("tmdb-{id}"),
            source: "tmdb".into(),
            media_type: media.into(),
            title: format!("Item {id}"),
            parent_id: None,
            parent_title: None,
            season: None,
            episode: None,
            poster_path: poster.map(str::to_owned),
            release_date: None,
            vote_average: None,
            runtime: None,
            custom_rank: None,
            is_watched: watched,
            authors: None,
            added_at: "2020-01-01 00:00:00".into(),
        }
    }

    #[test]
    fn empty_list_reports_zero_progress() {
        assert_eq!(progress(0, 0), 0);
    }

    #[test]
    fn completed_list_reports_one_hundred_progress() {
        assert_eq!(progress(4, 4), 100);
    }

    #[test]
    fn partial_progress_stays_below_one_hundred() {
        assert_eq!(progress(3, 1), 33);
        assert_eq!(progress(100, 99), 99);
    }

    #[test]
    fn detail_stats_prefer_next_unwatched_then_first_item_for_the_cover() {
        let items = vec![
            item(1, true, Some("/watched.jpg"), "movie"),
            item(2, false, None, "episode"),
            item(3, false, Some("/later.jpg"), "book"),
        ];
        let stats = stats_from_items(&items);
        assert_eq!(stats.total_items, 3);
        assert_eq!(stats.watched_items, 1);
        assert_eq!(stats.progress, 33);
        assert_eq!(stats.next_unwatched.as_ref().unwrap().id, 2);
        assert_eq!(stats.cover_image, None);
        assert_eq!(stats.cover_media_type.as_deref(), Some("episode"));

        let watched = vec![item(1, true, Some("/first.jpg"), "movie")];
        let completed = stats_from_items(&watched);
        assert_eq!(completed.progress, 100);
        assert!(completed.next_unwatched.is_none());
        assert_eq!(completed.cover_image.as_deref(), Some("/first.jpg"));
    }

    #[test]
    fn summary_builds_cover_from_the_selected_item_without_extra_state() {
        let next = item(2, false, Some("/next.jpg"), "episode");
        let first = item(3, false, None, "book");
        let stats = build_stats(3, 1, SummarySelection::new(Some(next), Some(&first)));
        assert_eq!(stats.progress, 33);
        assert_eq!(stats.cover_image.as_deref(), Some("/next.jpg"));
        assert_eq!(stats.cover_media_type.as_deref(), Some("episode"));
    }
}
