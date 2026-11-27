//! TMDB movie addition. The duplicate read and the movie fetch both finish
//! before [`super::persist::persist_items`] opens its write transaction.

use crate::integrations::tmdb::{TmdbCatalog, TmdbMovie};

use super::persist::{self, NewItem, PersistResult};
use super::request::InsertionIntent;
use super::{
    Unchanged, WatchlistWriteResult, Watchlists, WriteFailure, internal_error, tmdb_failure,
};

pub(super) async fn add_movie(
    lists: &Watchlists,
    catalog: &dyn TmdbCatalog,
    watchlist_id: i64,
    tmdb_id: u64,
    insertion: &InsertionIntent,
) -> WatchlistWriteResult {
    let stored_id = tmdb_id.to_string();
    let exists = match persist::movie_exists(lists, watchlist_id, &stored_id).await {
        Ok(exists) => exists,
        Err(error) => return internal_error(error),
    };
    if exists {
        return duplicate();
    }
    let details = match catalog.movie(tmdb_id).await {
        Ok(details) => details,
        Err(failure) => return tmdb_failure(failure),
    };
    match persist::persist_items(
        lists,
        watchlist_id,
        &[movie_item(stored_id, details)],
        insertion,
    )
    .await
    {
        Ok(PersistResult::Inserted(count)) => WatchlistWriteResult::from_count(
            count,
            "Added to watchlist",
            Unchanged::Duplicate("Already in watchlist".into()),
        ),
        Ok(PersistResult::Destination(failure)) => super::from_destination(failure),
        Ok(PersistResult::InvalidReference { reference_item_id }) => WatchlistWriteResult::failed(
            WriteFailure::InvalidReference,
            persist::invalid_reference_message(reference_item_id),
        ),
        Err(error) => internal_error(error),
    }
}

fn duplicate() -> WatchlistWriteResult {
    WatchlistWriteResult::Duplicate {
        message: "Already in watchlist".into(),
    }
}

fn movie_item(tmdb_id: String, details: TmdbMovie) -> NewItem {
    NewItem {
        tmdb_id,
        source: "tmdb",
        media_type: "movie",
        title: details.title,
        parent_id: None,
        parent_title: None,
        season: None,
        episode: None,
        poster_path: details.poster_path,
        release_date: details.release_date,
        vote_average: details.vote_average,
        runtime: details.runtime,
    }
}
