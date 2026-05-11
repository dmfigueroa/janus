import pLimit from "p-limit";
import { watchlistItems } from "@/db/schema";
import type {
  AddToWatchlistInput,
  WatchlistMedia,
  GenericMedia,
} from "@/features/watchlists/mutations";
import * as repository from "@/features/watchlists/repository.server";
import { getComicIssues } from "@/server/providers/comicvine.server";
import { getBookDetails } from "@/server/providers/google-books.server";
import { getGameDetails } from "@/server/providers/rawg.server";
import {
  getMovieDetails,
  getSeasonDetails,
  getTVDetails,
} from "@/server/providers/tmdb-api.server";
import { getDeprecatedWatchlistAddRejection, type WatchlistAddRejection } from "@/server/media";

const limit = pLimit(5);
const UNSUPPORTED_TV_SOURCE_MESSAGE =
  "TV shows must come from TMDB so Janus can expand them into episodes.";
const COMICVINE_UNAVAILABLE_MESSAGE =
  "Comic additions are unavailable because the ComicVine integration is not configured.";
const RAWG_UNAVAILABLE_MESSAGE =
  "Game additions are unavailable because the RAWG integration is not configured.";
const TMDB_MOVIE_FETCH_FAILURE_MESSAGE = "Failed to fetch movie details from TMDB.";
const TMDB_TV_FETCH_FAILURE_MESSAGE = "Failed to fetch TV details from TMDB.";
const COMICVINE_FETCH_FAILURE_MESSAGE = "Failed to fetch comic issues from ComicVine.";
const GOOGLE_BOOKS_FETCH_FAILURE_MESSAGE = "Failed to fetch book details from Google Books.";
const RAWG_FETCH_FAILURE_MESSAGE = "Failed to fetch game details from RAWG.";

type WatchlistWriteResult = { success: true; message: string } | WatchlistAddRejection;
type TMDBEpisode = {
  id: number;
  name: string;
  season_number: number;
  episode_number: number;
  still_path: string | null;
  air_date?: string;
  vote_average: number;
  runtime?: number | null;
};

const formatCount = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

const rejectAdd = (message: string): WatchlistAddRejection => ({
  success: false,
  message,
});

export async function addToWatchlistMutation({
  watchlistId,
  media,
}: AddToWatchlistInput): Promise<WatchlistWriteResult> {
  const deprecatedRejection = getDeprecatedWatchlistAddRejection(media.mediaType);
  if (deprecatedRejection) {
    return deprecatedRejection;
  }

  if (media.mediaType === "tv") {
    if (media.source !== "tmdb") {
      return rejectAdd(UNSUPPORTED_TV_SOURCE_MESSAGE);
    }
    return addTVShowToWatchlist(watchlistId, Number.parseInt(media.id, 10), media);
  }

  if (media.source === "tmdb" && media.mediaType === "movie") {
    return addMovieToWatchlist(watchlistId, Number.parseInt(media.id, 10));
  }

  if (media.source === "comicvine" && media.mediaType === "comic") {
    return addComicToWatchlist(watchlistId, media.id, media);
  }

  if (media.source === "google_books" && media.mediaType === "book") {
    return addBookToWatchlist(watchlistId, media);
  }

  if (media.source === "rawg" && media.mediaType === "game") {
    return addGameToWatchlist(watchlistId, media);
  }

  return addGenericItemToWatchlist(watchlistId, media as GenericMedia);
}

async function addTVShowToWatchlist(
  watchlistId: number,
  tmdbId: number,
  media: WatchlistMedia,
): Promise<WatchlistWriteResult> {
  let showDetails: Awaited<ReturnType<typeof getTVDetails>>;
  let allEpisodes: Array<typeof watchlistItems.$inferInsert>;

  try {
    showDetails = await getTVDetails({ data: { id: tmdbId } });
    const showTitle = showDetails.name || media.title;
    const seasons = showDetails.seasons || [];
    const seasonEpisodeLists = await Promise.all(
      seasons
        .filter((season: { season_number: number }) => season.season_number !== 0)
        .map((season: { season_number: number }) =>
          limit(() =>
            getSeasonDetails({ data: { id: tmdbId, seasonNumber: season.season_number } }).then(
              (seasonDetails: { episodes: TMDBEpisode[] }) => seasonDetails.episodes,
            ),
          ),
        ),
    );

    allEpisodes = seasonEpisodeLists.flat().map((episode) => ({
      watchlistId,
      tmdbId: episode.id.toString(),
      source: "tmdb" as const,
      mediaType: "episode" as const,
      title: episode.name,
      parentTitle: showTitle,
      season: episode.season_number,
      episode: episode.episode_number.toString(),
      posterPath: episode.still_path || showDetails.poster_path,
      releaseDate: episode.air_date,
      voteAverage: episode.vote_average,
      runtime: episode.runtime || 0,
    }));
  } catch {
    return rejectAdd(TMDB_TV_FETCH_FAILURE_MESSAGE);
  }

  if (allEpisodes.length === 0) {
    return { success: true, message: "No episodes found for this show" };
  }

  const existingEpisodeIds = await repository.getExistingEpisodesInWatchlist(watchlistId);
  const newEpisodes = allEpisodes.filter(
    (episode) => !existingEpisodeIds.has(episode.tmdbId ?? ""),
  );

  if (newEpisodes.length === 0) {
    return { success: true, message: "No new episodes found for this show" };
  }

  await repository.insertWatchlistItems(newEpisodes);
  await repository.markLastItemAdded(watchlistId);

  return {
    success: true,
    message: `Added ${formatCount(newEpisodes.length, "new episode", "new episodes")} to watchlist`,
  };
}

async function addMovieToWatchlist(
  watchlistId: number,
  tmdbId: number,
): Promise<WatchlistWriteResult> {
  const existing = await repository.getExistingMovieInWatchlist(watchlistId, tmdbId);

  if (existing.length > 0) {
    return { success: true, message: "Already in watchlist" };
  }

  let details: Awaited<ReturnType<typeof getMovieDetails>>;
  try {
    details = await getMovieDetails({ data: { id: tmdbId } });
  } catch {
    return rejectAdd(TMDB_MOVIE_FETCH_FAILURE_MESSAGE);
  }

  const inserted = await repository.insertWatchlistItem({
    watchlistId,
    tmdbId: tmdbId.toString(),
    source: "tmdb",
    mediaType: "movie",
    title: details.title || details.name || "Unknown",
    posterPath: details.poster_path,
    releaseDate: details.release_date,
    voteAverage: details.vote_average,
    runtime: details.runtime || 0,
  });

  if (!inserted) {
    return { success: true, message: "Already in watchlist" };
  }

  await repository.markLastItemAdded(watchlistId);

  return { success: true, message: "Added to watchlist" };
}

async function addComicToWatchlist(watchlistId: number, volumeId: string, media: WatchlistMedia) {
  const apiKey = process.env.COMICVINE_API_KEY;
  if (!apiKey) {
    return rejectAdd(COMICVINE_UNAVAILABLE_MESSAGE);
  }

  const existingIssueIds = await repository.getExistingComicsInWatchlist(watchlistId);
  let issues: Awaited<ReturnType<typeof getComicIssues>>;
  try {
    issues = await getComicIssues(volumeId, apiKey, { knownIssueIds: existingIssueIds });
  } catch {
    return rejectAdd(COMICVINE_FETCH_FAILURE_MESSAGE);
  }

  if (issues.length === 0) {
    return {
      success: true,
      message:
        existingIssueIds.size > 0
          ? "No new issues found for this volume"
          : "No issues found for this volume",
    };
  }

  const watchlistItemsData: Array<typeof watchlistItems.$inferInsert> = issues.map((issue) => ({
    watchlistId,
    tmdbId: issue.id,
    source: "comicvine",
    mediaType: "comic" as const,
    title: issue.title,
    parentTitle: media.title,
    season: null,
    episode: issue.issueNumber,
    posterPath: issue.poster,
    releaseDate: issue.coverDate,
    voteAverage: 0,
    runtime: 0,
  }));

  await repository.insertWatchlistItems(watchlistItemsData);
  await repository.markLastItemAdded(watchlistId);

  const newIssueCount = watchlistItemsData.length;
  const message =
    existingIssueIds.size > 0
      ? `Added ${newIssueCount} new issues to watchlist`
      : `Added ${newIssueCount} issues to watchlist`;

  return { success: true, message };
}

async function addBookToWatchlist(
  watchlistId: number,
  media: WatchlistMedia,
): Promise<WatchlistWriteResult> {
  let details: Awaited<ReturnType<typeof getBookDetails>>;
  try {
    details = await getBookDetails(media.id);
  } catch {
    return rejectAdd(GOOGLE_BOOKS_FETCH_FAILURE_MESSAGE);
  }
  return addGenericItemToWatchlist(watchlistId, details);
}

async function addGameToWatchlist(
  watchlistId: number,
  media: WatchlistMedia,
): Promise<WatchlistWriteResult> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    return rejectAdd(RAWG_UNAVAILABLE_MESSAGE);
  }

  let details: Awaited<ReturnType<typeof getGameDetails>>;
  try {
    details = await getGameDetails(media.id, apiKey);
  } catch {
    return rejectAdd(RAWG_FETCH_FAILURE_MESSAGE);
  }
  return addGenericItemToWatchlist(watchlistId, details);
}

async function addGenericItemToWatchlist(
  watchlistId: number,
  media: GenericMedia,
): Promise<WatchlistWriteResult> {
  const inserted = await repository.insertWatchlistItem({
    watchlistId,
    tmdbId: media.id,
    source: media.source,
    mediaType: media.mediaType,
    title: media.title,
    posterPath: media.poster,
    releaseDate: media.releaseDate || media.year,
    voteAverage: media.rating,
    runtime: 0,
  });

  if (!inserted) {
    return { success: true, message: "Already in watchlist" };
  }

  await repository.markLastItemAdded(watchlistId);

  return { success: true, message: "Added to watchlist" };
}
