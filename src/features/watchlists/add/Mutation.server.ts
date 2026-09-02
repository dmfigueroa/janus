import type { AddToWatchlistInput, GenericMedia } from "./Mutation";
import { getDeprecatedWatchlistAddRejection } from "@/server/Media";
import { rejectAdd, type WatchlistWriteResult } from "./Shared.server";
import { addTVShowToWatchlist } from "./AddTv.server";
import { addMovieToWatchlist } from "./AddMovie.server";
import { addComicToWatchlist } from "./AddComic.server";
import { addBookToWatchlist } from "./AddBook.server";
import { addGameToWatchlist } from "./AddGame.server";
import { addGenericItemToWatchlist } from "./AddGeneric.server";

export const UNSUPPORTED_TV_SOURCE_MESSAGE =
  "TV shows must come from TMDB so Janus can expand them into episodes.";

export async function addToWatchlistMutation({
  watchlistId,
  media,
  insertionPosition,
}: AddToWatchlistInput): Promise<WatchlistWriteResult> {
  const deprecatedRejection = getDeprecatedWatchlistAddRejection(media.mediaType);
  if (deprecatedRejection) {
    return deprecatedRejection;
  }

  return dispatchWatchlistAddition({ watchlistId, media, insertionPosition });
}

function dispatchWatchlistAddition({
  watchlistId,
  media,
  insertionPosition,
}: AddToWatchlistInput): Promise<WatchlistWriteResult> {
  if (media.mediaType === "tv") {
    return addTvMedia(watchlistId, media, insertionPosition);
  }

  return dispatchNonTvAddition(watchlistId, media, insertionPosition);
}

function addTvMedia(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
) {
  if (media.source !== "tmdb") {
    return Promise.resolve(rejectAdd(UNSUPPORTED_TV_SOURCE_MESSAGE));
  }
  return addTVShowToWatchlist(watchlistId, Number.parseInt(media.id, 10), media, insertionPosition);
}

function dispatchNonTvAddition(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
): Promise<WatchlistWriteResult> {
  if (media.source === "tmdb" && media.mediaType === "movie") {
    return addMovieToWatchlist(watchlistId, Number.parseInt(media.id, 10), insertionPosition);
  }
  return dispatchComicAddition(watchlistId, media, insertionPosition);
}

function dispatchComicAddition(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
): Promise<WatchlistWriteResult> {
  if (media.source === "comicvine" && media.mediaType === "comic") {
    return addComicToWatchlist(watchlistId, media.id, media, insertionPosition);
  }
  return dispatchBookAddition(watchlistId, media, insertionPosition);
}

function dispatchBookAddition(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
): Promise<WatchlistWriteResult> {
  if (media.source === "google_books" && media.mediaType === "book") {
    return addBookToWatchlist(watchlistId, media, insertionPosition);
  }
  return dispatchGameAddition(watchlistId, media, insertionPosition);
}

function dispatchGameAddition(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
): Promise<WatchlistWriteResult> {
  if (media.source === "rawg" && media.mediaType === "game") {
    return addGameToWatchlist(watchlistId, media, insertionPosition);
  }

  return addGenericItemToWatchlist(watchlistId, media as GenericMedia, insertionPosition);
}
