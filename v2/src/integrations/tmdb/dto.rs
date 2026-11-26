//! Parse TMDB JSON into the records feature code stores and displays.

use super::{TmdbEpisode, TmdbKind, TmdbMovie, TmdbSearchHit, TmdbSearchPage, TmdbShow};
use serde::Deserialize;
use serde_json::Value;

pub(super) fn parse_search(body: Value, kind: TmdbKind) -> Result<TmdbSearchPage, ()> {
    let body: SearchBody = serde_json::from_value(body).map_err(|_| ())?;
    let hits = body
        .results
        .into_iter()
        .map(|hit| map_hit(hit, kind))
        .collect::<Result<Vec<_>, ()>>()?;
    Ok(TmdbSearchPage {
        hits,
        total_pages: body.total_pages.filter(|pages| *pages > 0).unwrap_or(1),
        total_results: body.total_results.unwrap_or(0),
    })
}

pub(super) fn parse_movie(body: Value) -> Result<TmdbMovie, ()> {
    let body: MovieBody = serde_json::from_value(body).map_err(|_| ())?;
    Ok(TmdbMovie {
        title: first_text(body.title, body.name).unwrap_or_else(|| "Unknown".into()),
        poster_path: blank_as_none(body.poster_path),
        release_date: blank_as_none(body.release_date),
        vote_average: body.vote_average,
        runtime: nonzero(body.runtime),
    })
}

pub(super) fn parse_show(body: Value) -> Result<TmdbShow, ()> {
    let body: ShowBody = serde_json::from_value(body).map_err(|_| ())?;
    Ok(TmdbShow {
        name: blank_as_none(body.name),
        poster_path: blank_as_none(body.poster_path),
        seasons: body
            .seasons
            .into_iter()
            .map(|season| season.season_number)
            .collect(),
    })
}

pub(super) fn parse_season(body: Value) -> Result<Vec<TmdbEpisode>, ()> {
    let body: SeasonBody = serde_json::from_value(body).map_err(|_| ())?;
    body.episodes
        .into_iter()
        .map(|episode| {
            Ok(TmdbEpisode {
                id: episode.id.to_string(),
                name: episode.name,
                season_number: episode.season_number,
                episode_number: episode.episode_number,
                still_path: blank_as_none(episode.still_path),
                air_date: blank_as_none(episode.air_date),
                vote_average: episode.vote_average,
                runtime: nonzero(episode.runtime),
            })
        })
        .collect()
}

fn map_hit(hit: SearchHit, requested: TmdbKind) -> Result<TmdbSearchHit, ()> {
    let release_date = blank_as_none(hit.release_date.or(hit.first_air_date));
    Ok(TmdbSearchHit {
        id: hit.id.to_string(),
        media_type: hit
            .media_type
            .as_deref()
            .and_then(parse_kind)
            .unwrap_or(requested),
        title: first_text(hit.title, hit.name).unwrap_or_else(|| "Untitled".into()),
        poster: image(hit.poster_path, "w500"),
        backdrop: image(hit.backdrop_path, "w1280"),
        year: release_date
            .as_deref()
            .and_then(|date| date.split('-').next())
            .filter(|year| !year.is_empty())
            .map(str::to_owned),
        release_date,
        rating: hit.vote_average,
        overview: hit.overview,
    })
}

fn parse_kind(value: &str) -> Option<TmdbKind> {
    match value {
        "movie" => Some(TmdbKind::Movie),
        "tv" => Some(TmdbKind::Tv),
        _ => None,
    }
}

fn first_text(primary: Option<String>, fallback: Option<String>) -> Option<String> {
    blank_as_none(primary).or_else(|| blank_as_none(fallback))
}

fn blank_as_none(value: Option<String>) -> Option<String> {
    value.filter(|text| !text.is_empty())
}

fn image(path: Option<String>, size: &str) -> Option<String> {
    blank_as_none(path).map(|path| format!("https://image.tmdb.org/t/p/{size}{path}"))
}

/// v1 uses `runtime || 0`, so null, missing, and 0 all persist as 0.
fn nonzero(value: Option<i64>) -> i64 {
    value.filter(|runtime| *runtime != 0).unwrap_or(0)
}

#[derive(Deserialize)]
struct SearchBody {
    results: Vec<SearchHit>,
    #[serde(default)]
    total_pages: Option<u32>,
    #[serde(default)]
    total_results: Option<u32>,
}

#[derive(Deserialize)]
struct SearchHit {
    id: i64,
    #[serde(default)]
    media_type: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    poster_path: Option<String>,
    #[serde(default)]
    backdrop_path: Option<String>,
    #[serde(default)]
    release_date: Option<String>,
    #[serde(default)]
    first_air_date: Option<String>,
    #[serde(default)]
    vote_average: Option<f64>,
    #[serde(default)]
    overview: Option<String>,
}

#[derive(Deserialize)]
struct MovieBody {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    name: Option<String>,
    poster_path: Option<String>,
    #[serde(default)]
    release_date: Option<String>,
    #[serde(default)]
    vote_average: Option<f64>,
    #[serde(default)]
    runtime: Option<i64>,
}

#[derive(Deserialize)]
struct ShowBody {
    #[serde(default)]
    name: Option<String>,
    poster_path: Option<String>,
    seasons: Vec<SeasonRef>,
}

#[derive(Deserialize)]
struct SeasonRef {
    season_number: i64,
}

#[derive(Deserialize)]
struct SeasonBody {
    episodes: Vec<EpisodeBody>,
}

#[derive(Deserialize)]
struct EpisodeBody {
    id: i64,
    name: String,
    season_number: i64,
    episode_number: i64,
    still_path: Option<String>,
    #[serde(default)]
    air_date: Option<String>,
    vote_average: f64,
    #[serde(default)]
    runtime: Option<i64>,
}
