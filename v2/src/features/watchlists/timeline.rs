//! Feature-owned watchlist detail timeline presentation.
//!
//! Transforms one typed [`WatchlistDetail`] snapshot and typed filter inputs into
//! the page and fragment markup shared by web responses. It has no Axum or
//! database dependency, so behavior is exercised directly from snapshots.

use super::dialog::WatchlistForm;
use super::{ItemOrderMode, WatchlistDetail, WatchlistItem};
use askama::Template;

const TMDB_POSTER_PREFIX: &str = "https://image.tmdb.org/t/p/w200/";

/// Display filters applied to one detail snapshot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TimelineFilters {
    pub query: String,
    pub unwatched: bool,
}

impl TimelineFilters {
    pub fn new(query: impl Into<String>, unwatched: bool) -> Self {
        Self {
            query: query.into(),
            unwatched,
        }
    }

    fn normalized_query(&self) -> String {
        self.query.trim().to_ascii_lowercase()
    }
}

impl Default for TimelineFilters {
    fn default() -> Self {
        Self {
            query: String::new(),
            unwatched: true,
        }
    }
}

/// A detail snapshot rendered as release-year or custom-order timeline runs.
#[derive(Debug)]
pub struct TimelineView {
    id: i64,
    name: String,
    description: String,
    custom: bool,
    progress: u64,
    watched: u64,
    total: u64,
    query: String,
    unwatched: bool,
    runs: Vec<Run>,
    paused: bool,
    form: WatchlistForm,
}

impl TimelineView {
    /// Applies filters to one typed detail snapshot without reordering items.
    pub fn new(detail: &WatchlistDetail, filters: &TimelineFilters) -> Self {
        let list = &detail.watchlist.watchlist;
        let stats = &detail.watchlist.stats;
        let query = filters.normalized_query();
        let rows: Vec<Row> = detail
            .items
            .iter()
            .filter(|item| item.matches_text(&query))
            .map(Row::from_item)
            .collect();
        Self {
            id: list.id,
            name: list.name.clone(),
            description: list.description.clone().unwrap_or_default(),
            custom: list.item_order_mode == ItemOrderMode::Custom,
            progress: stats.progress,
            watched: stats.watched_items as u64,
            total: stats.total_items as u64,
            query: filters.query.clone(),
            unwatched: filters.unwatched,
            runs: runs(
                &rows,
                list.item_order_mode == ItemOrderMode::Release,
                filters.unwatched,
            ),
            paused: list.paused_at.is_some(),
            form: WatchlistForm::edit(list),
        }
    }

    /// Renders the full detail page with an empty status message.
    ///
    /// # Errors
    ///
    /// Returns [`askama::Error`] when a template cannot be rendered.
    pub fn render_page(&self) -> Result<String, askama::Error> {
        Page {
            view: self,
            form: &self.form,
            message: "",
        }
        .render()
    }

    /// Renders the timeline fragment, such as a reorder response.
    ///
    /// # Errors
    ///
    /// Returns [`askama::Error`] when the template cannot be rendered.
    pub fn render_fragment(&self, message: &str) -> Result<String, askama::Error> {
        Fragment {
            view: self,
            message,
        }
        .render()
    }
}

#[derive(Clone, Debug)]
struct Row {
    id: i64,
    title: String,
    parent: String,
    episode: String,
    date: String,
    year: String,
    watched: bool,
    poster: String,
    media: String,
}

impl Row {
    fn from_item(item: &WatchlistItem) -> Self {
        let date = item.release_date.clone().unwrap_or_default();
        Self {
            id: item.id,
            title: item.title.clone(),
            parent: item.parent_title.clone().unwrap_or_default(),
            episode: item.episode.clone().unwrap_or_default(),
            year: display_year(&date),
            date,
            watched: item.is_watched == Some(true),
            poster: poster(item.poster_path.as_deref().unwrap_or("")),
            media: item.media_type.clone(),
        }
    }
}

#[derive(Debug)]
struct Run {
    year: String,
    heading: bool,
    collapsed: bool,
    rows: Vec<Row>,
}

fn display_year(date: &str) -> String {
    if date.is_empty() {
        "TBA".into()
    } else {
        date.split_once('-').map_or(date, |(year, _)| year).into()
    }
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

/// Splits adjacent rows on watched state, and on release year in release mode.
fn runs(rows: &[Row], release_mode: bool, unwatched: bool) -> Vec<Run> {
    let groups: Vec<&[Row]> = rows
        .chunk_by(|previous, next| {
            previous.watched == next.watched && (!release_mode || previous.year == next.year)
        })
        .collect();
    groups
        .iter()
        .enumerate()
        .map(|(index, rows)| Run {
            year: rows[0].year.clone(),
            heading: release_mode && (index == 0 || groups[index - 1][0].year != rows[0].year),
            collapsed: unwatched && rows[0].watched,
            rows: rows.to_vec(),
        })
        .collect()
}

#[derive(Template)]
#[template(path = "watchlist.html")]
struct Page<'a> {
    view: &'a TimelineView,
    form: &'a WatchlistForm,
    message: &'a str,
}

#[derive(Template)]
#[template(path = "timeline.html")]
struct Fragment<'a> {
    view: &'a TimelineView,
    message: &'a str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::watchlists::{WatchlistRecord, WatchlistStats, WatchlistSummary};

    fn item(
        id: i64,
        title: &str,
        release_date: Option<&str>,
        watched: Option<bool>,
    ) -> WatchlistItem {
        WatchlistItem {
            id,
            watchlist_id: 1,
            tmdb_id: format!("tmdb-{id}"),
            source: "tmdb".into(),
            media_type: "movie".into(),
            title: title.into(),
            parent_id: None,
            parent_title: None,
            season: None,
            episode: None,
            poster_path: None,
            release_date: release_date.map(str::to_owned),
            vote_average: None,
            runtime: None,
            custom_rank: None,
            is_watched: watched,
            authors: None,
            added_at: "2020-01-01 00:00:00".into(),
        }
    }

    fn detail(mode: ItemOrderMode, items: Vec<WatchlistItem>) -> WatchlistDetail {
        let watched_items = items
            .iter()
            .filter(|item| item.is_watched == Some(true))
            .count();
        WatchlistDetail {
            watchlist: WatchlistSummary {
                watchlist: WatchlistRecord {
                    id: 1,
                    name: "Watchlist".into(),
                    description: Some("Description".into()),
                    item_order_mode: mode,
                    created_at: "2020-01-01 00:00:00".into(),
                    updated_at: None,
                    last_watched_at: None,
                    last_item_added_at: None,
                    paused_at: None,
                },
                stats: WatchlistStats {
                    total_items: items.len(),
                    watched_items,
                    progress: 0,
                    next_unwatched: None,
                    cover_image: None,
                    cover_media_type: None,
                },
            },
            items,
            order_token: "sha256:test".into(),
        }
    }

    fn fragment(view: &TimelineView) -> String {
        view.render_fragment("Order saved.").unwrap()
    }

    #[test]
    fn release_order_shows_years_and_tba_without_dates() {
        let view = TimelineView::new(
            &detail(
                ItemOrderMode::Release,
                vec![
                    item(1, "First", Some("2020-01-02"), None),
                    item(2, "Second", Some("2020-02-02"), Some(true)),
                    item(3, "Undated", None, None),
                    item(4, "Older", Some("2019-05-01"), None),
                ],
            ),
            &TimelineFilters::default(),
        );
        assert_eq!(
            view.runs
                .iter()
                .map(|run| run.year.as_str())
                .collect::<Vec<_>>(),
            vec!["2020", "2020", "TBA", "2019"]
        );
        assert_eq!(
            view.runs.iter().map(|run| run.heading).collect::<Vec<_>>(),
            vec![true, false, true, true]
        );
        assert_eq!(view.runs[2].rows[0].year, "TBA");
        assert_eq!(view.runs[2].rows[0].date, "");
        assert_eq!(view.runs[0].rows[0].date, "2020-01-02");
        let html = view.render_page().unwrap();
        assert!(html.contains("<h2>2020</h2>"), "{html}");
        assert_eq!(html.matches("<h2>2020</h2>").count(), 1, "{html}");
        assert!(html.contains("<h2>TBA</h2>"), "{html}");
        assert!(html.contains("<h2>2019</h2>"), "{html}");
        assert!(html.contains("<p>2020-01-02</p>"), "{html}");
    }

    #[test]
    fn custom_order_keeps_rows_and_groups_watched_runs_across_years() {
        let view = TimelineView::new(
            &detail(
                ItemOrderMode::Custom,
                vec![
                    item(1, "First", Some("2020-01-02"), Some(true)),
                    item(2, "Second", Some("2021-02-02"), Some(true)),
                    item(3, "Third", None, Some(true)),
                    item(4, "Fourth", Some("2018-03-03"), None),
                ],
            ),
            &TimelineFilters::default(),
        );
        assert_eq!(
            view.runs
                .iter()
                .map(|run| run.rows.iter().map(|row| row.id).collect::<Vec<_>>())
                .collect::<Vec<_>>(),
            vec![vec![1, 2, 3], vec![4]]
        );
        assert_eq!(
            view.runs.iter().map(|run| run.heading).collect::<Vec<_>>(),
            vec![false, false]
        );
        assert!(view.runs[0].collapsed);
        assert!(!view.runs[1].collapsed);
        let html = fragment(&view);
        assert_eq!(html.matches("<details class=\"watched-run\">").count(), 1);
        assert!(html.contains("3 watched items"), "{html}");
        assert!(!html.contains("<h2>"), "{html}");
        assert!(
            html.find("data-item-id=\"1\"").unwrap() < html.find("data-item-id=\"2\"").unwrap()
                && html.find("data-item-id=\"2\"").unwrap()
                    < html.find("data-item-id=\"3\"").unwrap()
                && html.find("data-item-id=\"3\"").unwrap()
                    < html.find("data-item-id=\"4\"").unwrap(),
            "{html}"
        );
    }

    #[test]
    fn release_order_splits_watched_runs_by_year() {
        let view = TimelineView::new(
            &detail(
                ItemOrderMode::Release,
                vec![
                    item(1, "First", Some("2020-01-02"), Some(true)),
                    item(2, "Second", Some("2021-02-02"), Some(true)),
                ],
            ),
            &TimelineFilters::default(),
        );
        assert_eq!(view.runs.len(), 2);
        assert!(view.runs.iter().all(|run| run.heading && run.collapsed));
        let html = fragment(&view);
        assert_eq!(html.matches("<details class=\"watched-run\">").count(), 2);
        assert!(html.contains("<h2>2020</h2>"), "{html}");
        assert!(html.contains("<h2>2021</h2>"), "{html}");
    }

    #[test]
    fn filters_match_titles_parents_and_episodes_and_ignore_watched_runs_when_requested() {
        let mut episode = item(2, "Episode", None, None);
        episode.parent_title = Some("A Show".into());
        episode.episode = Some("Pilot".into());
        let snapshot = detail(
            ItemOrderMode::Custom,
            vec![
                item(1, "First", Some("2020-01-02"), Some(true)),
                episode,
                item(3, "Last", None, None),
            ],
        );
        for query in ["episode", " SHOW ", "pilot"] {
            let view = TimelineView::new(&snapshot, &TimelineFilters::new(query, false));
            assert_eq!(view.runs.len(), 1, "{query}");
            assert_eq!(view.runs[0].rows.len(), 1, "{query}");
            assert_eq!(view.runs[0].rows[0].id, 2, "{query}");
            assert!(!view.runs[0].collapsed, "{query}");
        }
        let html = fragment(&TimelineView::new(
            &snapshot,
            &TimelineFilters::new("", false),
        ));
        assert!(!html.contains("<details class=\"watched-run\">"), "{html}");
        assert!(html.contains("data-item-id=\"1\""), "{html}");
    }

    #[test]
    fn empty_results_render_the_filter_status_in_page_and_fragment() {
        let view = TimelineView::new(
            &detail(
                ItemOrderMode::Custom,
                vec![item(1, "First", Some("2020-01-02"), None)],
            ),
            &TimelineFilters::new("missing", true),
        );
        for html in [fragment(&view), view.render_page().unwrap()] {
            assert!(html.contains("No items match these filters."), "{html}");
            assert!(!html.contains("data-item-id="), "{html}");
        }
    }

    #[test]
    fn rows_resolve_posters_and_keep_metadata() {
        let mut first = item(1, "First", Some("2020-01-02"), None);
        first.poster_path = Some("/poster.jpg".into());
        first.parent_title = Some("Parent".into());
        first.episode = Some("2".into());
        let mut second = item(2, "Second", None, None);
        second.poster_path = Some("https://images.example/poster.jpg".into());
        let view = TimelineView::new(
            &detail(
                ItemOrderMode::Custom,
                vec![first, second, item(3, "Third", None, None)],
            ),
            &TimelineFilters::default(),
        );
        assert_eq!(
            view.runs[0].rows[0].poster,
            "https://image.tmdb.org/t/p/w200/poster.jpg"
        );
        assert_eq!(
            view.runs[0].rows[1].poster,
            "https://images.example/poster.jpg"
        );
        assert_eq!(view.runs[0].rows[2].poster, "");
        assert_eq!(view.runs[0].rows[0].parent, "Parent");
        assert_eq!(view.runs[0].rows[0].episode, "2");
        let html = fragment(&view);
        assert!(
            html.contains("src=\"https://image.tmdb.org/t/p/w200/poster.jpg\""),
            "{html}"
        );
        assert!(html.contains("<div class=\"poster placeholder\""), "{html}");
    }

    #[test]
    fn page_and_fragment_share_one_timeline_and_header_values() {
        let view = TimelineView::new(
            &detail(
                ItemOrderMode::Custom,
                vec![item(1, "First", Some("2020-01-02"), None)],
            ),
            &TimelineFilters::new("First", true),
        );
        let page = view.render_page().unwrap();
        assert!(page.contains("<!doctype html>"), "{page}");
        assert!(page.contains("<title>Watchlist · Janus</title>"), "{page}");
        assert!(page.contains("0/1 Watched"), "{page}");
        assert!(page.contains("0% Complete"), "{page}");
        assert!(page.contains("value=\"First\""), "{page}");
        assert!(
            page.contains("hx-post=\"/v2/watchlists/1/reorder?query=First&amp;unwatched=true\""),
            "{page}"
        );
        let fragment = view.render_fragment("").unwrap();
        assert!(page.contains(&fragment), "{page}");
    }
}
