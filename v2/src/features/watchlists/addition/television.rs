//! TMDB television expansion and single-episode addition.
//!
//! Show and season HTTP finishes before the existing-episode read and before
//! the write transaction. Season 0 is skipped. At most five season requests
//! run at once, and episode order follows season order.

use std::collections::HashSet;

use crate::integrations::tmdb::{TmdbCatalog, TmdbEpisode, TmdbFailure};

use super::persist::{self, NewItem, PersistResult};
use super::request::InsertionIntent;
use super::{
    Unchanged, WatchlistWriteResult, Watchlists, WriteFailure, internal_error, tmdb_failure,
};

const SEASON_CONCURRENCY: usize = 5;

pub(super) async fn add_show(
    lists: &Watchlists,
    catalog: &dyn TmdbCatalog,
    watchlist_id: i64,
    show_id: u64,
    title: &str,
    insertion: &InsertionIntent,
) -> WatchlistWriteResult {
    let loaded = match load_show(catalog, show_id).await {
        Ok(loaded) => loaded,
        Err(failure) => return tmdb_failure(failure),
    };
    if loaded.episodes.is_empty() {
        return WatchlistWriteResult::NoNewItems {
            message: "No episodes found for this show".into(),
        };
    }
    let show_title = chosen_title(loaded.name.as_deref(), Some(title), false);
    let items = map_episodes(
        &loaded.episodes,
        show_id,
        &show_title,
        loaded.poster_path.as_deref(),
    );
    persist_episodes(
        lists,
        watchlist_id,
        show_id,
        items,
        insertion,
        Wording::Show,
    )
    .await
}

pub(super) async fn add_episode(
    lists: &Watchlists,
    catalog: &dyn TmdbCatalog,
    watchlist_id: i64,
    episode_id: u64,
    show_id: u64,
    show_title: Option<&str>,
    insertion: &InsertionIntent,
) -> WatchlistWriteResult {
    let loaded = match load_show(catalog, show_id).await {
        Ok(loaded) => loaded,
        Err(failure) => return tmdb_failure(failure),
    };
    let Some(episode) = loaded
        .episodes
        .iter()
        .find(|episode| episode.id == episode_id.to_string())
    else {
        return WatchlistWriteResult::failed(
            WriteFailure::NotFound,
            "TMDB episode was not found for this show.",
        );
    };
    let show_title = chosen_title(loaded.name.as_deref(), show_title, true);
    let items = map_episodes(
        std::slice::from_ref(episode),
        show_id,
        &show_title,
        loaded.poster_path.as_deref(),
    );
    persist_episodes(
        lists,
        watchlist_id,
        show_id,
        items,
        insertion,
        Wording::Episode,
    )
    .await
}

struct LoadedShow {
    name: Option<String>,
    poster_path: Option<String>,
    episodes: Vec<TmdbEpisode>,
}

async fn load_show(catalog: &dyn TmdbCatalog, show_id: u64) -> Result<LoadedShow, TmdbFailure> {
    let show = catalog.show(show_id).await?;
    let seasons: Vec<i64> = show
        .seasons
        .into_iter()
        .filter(|season| *season != 0)
        .collect();
    let episodes = fetch_seasons(catalog, show_id, &seasons).await?;
    Ok(LoadedShow {
        name: show.name,
        poster_path: show.poster_path,
        episodes,
    })
}

async fn fetch_seasons(
    catalog: &dyn TmdbCatalog,
    show_id: u64,
    seasons: &[i64],
) -> Result<Vec<TmdbEpisode>, TmdbFailure> {
    let mut episodes = Vec::new();
    for season_numbers in seasons.chunks(SEASON_CONCURRENCY) {
        let batch = futures::future::try_join_all(
            season_numbers
                .iter()
                .map(|season| catalog.season(show_id, *season)),
        )
        .await?;
        for season_episodes in batch {
            episodes.extend(season_episodes);
        }
    }
    Ok(episodes)
}

fn chosen_title(canonical: Option<&str>, fallback: Option<&str>, unknown_show: bool) -> String {
    nonempty(canonical)
        .or_else(|| nonempty(fallback))
        .map(str::to_owned)
        .unwrap_or_else(|| {
            if unknown_show {
                "Unknown Show".to_owned()
            } else {
                String::new()
            }
        })
}

fn nonempty(value: Option<&str>) -> Option<&str> {
    value.filter(|text| !text.is_empty())
}

fn map_episodes(
    episodes: &[TmdbEpisode],
    show_id: u64,
    show_title: &str,
    show_poster: Option<&str>,
) -> Vec<NewItem> {
    episodes
        .iter()
        .map(|episode| NewItem {
            tmdb_id: episode.id.clone(),
            source: "tmdb",
            media_type: "episode",
            title: episode.name.clone(),
            parent_id: Some(format!("tmdb:{show_id}")),
            parent_title: Some(show_title.to_owned()),
            season: Some(episode.season_number),
            episode: Some(episode.episode_number.to_string()),
            poster_path: episode
                .still_path
                .clone()
                .or_else(|| show_poster.map(str::to_owned)),
            release_date: episode.air_date.clone(),
            vote_average: Some(episode.vote_average),
            runtime: episode.runtime,
        })
        .collect()
}

enum Wording {
    Show,
    Episode,
}

async fn persist_episodes(
    lists: &Watchlists,
    watchlist_id: i64,
    show_id: u64,
    items: Vec<NewItem>,
    insertion: &InsertionIntent,
    wording: Wording,
) -> WatchlistWriteResult {
    let existing = match persist::existing_episode_ids(lists, watchlist_id, show_id).await {
        Ok(existing) => existing,
        Err(error) => return internal_error(error),
    };
    let items = without_existing(items, &existing);
    if items.is_empty() {
        return unchanged(wording);
    }
    match persist::persist_items(lists, watchlist_id, &items, insertion).await {
        Ok(PersistResult::Inserted(count)) => counted(count, wording),
        Ok(PersistResult::Destination(failure)) => super::from_destination(failure),
        Ok(PersistResult::InvalidReference { reference_item_id }) => WatchlistWriteResult::failed(
            WriteFailure::InvalidReference,
            persist::invalid_reference_message(reference_item_id),
        ),
        Err(error) => internal_error(error),
    }
}

fn without_existing(items: Vec<NewItem>, existing: &HashSet<String>) -> Vec<NewItem> {
    items
        .into_iter()
        .filter(|item| !existing.contains(&item.tmdb_id))
        .collect()
}

fn unchanged(wording: Wording) -> WatchlistWriteResult {
    match wording {
        Wording::Show => WatchlistWriteResult::NoNewItems {
            message: "No new episodes found for this show".into(),
        },
        Wording::Episode => WatchlistWriteResult::Duplicate {
            message: "Already in watchlist".into(),
        },
    }
}

fn counted(count: u32, wording: Wording) -> WatchlistWriteResult {
    match wording {
        Wording::Show => WatchlistWriteResult::from_count(
            count,
            episode_added_message(count),
            Unchanged::NoNewItems("No new episodes found for this show".into()),
        ),
        Wording::Episode => WatchlistWriteResult::from_count(
            count,
            "Added 1 episode to watchlist",
            Unchanged::Duplicate("Already in watchlist".into()),
        ),
    }
}

fn episode_added_message(count: u32) -> String {
    let label = if count == 1 {
        "new episode"
    } else {
        "new episodes"
    };
    format!("Added {count} {label} to watchlist")
}
