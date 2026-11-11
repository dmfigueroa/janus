import type { AddToWatchlistInput, GenericMedia } from "./Mutation";
import { getDeprecatedWatchlistAddRejection } from "@/server/Media";
import { rejectAdd, type WatchlistWriteResult } from "./AdditionOutcome";
import { validateWatchlistAdditionDestination } from "@/features/watchlists/InsertOrderedItem.server";
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
  referenceItemId,
}: AddToWatchlistInput): Promise<WatchlistWriteResult> {
  const deprecatedRejection = getDeprecatedWatchlistAddRejection(media.mediaType);
  if (deprecatedRejection) {
    return rejectAdd(deprecatedRejection.message, "unsupported");
  }
  const destination = validateWatchlistAdditionDestination({ watchlistId, insertionPosition });
  if (!destination.success) {
    return destination.failure;
  }

  return dispatchWatchlistAddition({ watchlistId, media, insertionPosition, referenceItemId });
}

function dispatchWatchlistAddition({
  watchlistId,
  media,
  insertionPosition,
  referenceItemId,
}: AddToWatchlistInput): Promise<WatchlistWriteResult> {
  if (media.mediaType === "tv") {
    return addTvMedia(watchlistId, media, insertionPosition, referenceItemId);
  }

  return dispatchNonTvAddition(watchlistId, media, insertionPosition, referenceItemId);
}

function addTvMedia(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
  referenceItemId: AddToWatchlistInput["referenceItemId"],
) {
  if (media.source !== "tmdb") {
    return Promise.resolve(rejectAdd(UNSUPPORTED_TV_SOURCE_MESSAGE, "unsupported"));
  }
  return addTVShowToWatchlist(
    watchlistId,
    Number.parseInt(media.id, 10),
    media,
    insertionPosition,
    referenceItemId,
  );
}

function dispatchNonTvAddition(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
  referenceItemId: AddToWatchlistInput["referenceItemId"],
): Promise<WatchlistWriteResult> {
  if (media.source === "tmdb" && media.mediaType === "movie") {
    return addMovieToWatchlist(
      watchlistId,
      Number.parseInt(media.id, 10),
      insertionPosition,
      referenceItemId,
    );
  }
  return dispatchComicAddition(watchlistId, media, insertionPosition, referenceItemId);
}

function dispatchComicAddition(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
  referenceItemId: AddToWatchlistInput["referenceItemId"],
): Promise<WatchlistWriteResult> {
  if (media.source === "comicvine" && media.mediaType === "comic") {
    return addComicToWatchlist(watchlistId, media.id, media, insertionPosition, referenceItemId);
  }
  return dispatchBookAddition(watchlistId, media, insertionPosition, referenceItemId);
}

function dispatchBookAddition(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
  referenceItemId: AddToWatchlistInput["referenceItemId"],
): Promise<WatchlistWriteResult> {
  if (media.source === "google_books" && media.mediaType === "book") {
    return addBookToWatchlist(watchlistId, media, insertionPosition, referenceItemId);
  }
  return dispatchGameAddition(watchlistId, media, insertionPosition, referenceItemId);
}

function dispatchGameAddition(
  watchlistId: number,
  media: AddToWatchlistInput["media"],
  insertionPosition: AddToWatchlistInput["insertionPosition"],
  referenceItemId: AddToWatchlistInput["referenceItemId"],
): Promise<WatchlistWriteResult> {
  if (media.source === "rawg" && media.mediaType === "game") {
    return addGameToWatchlist(watchlistId, media, insertionPosition, referenceItemId);
  }

  return addGenericItemToWatchlist(
    watchlistId,
    media as GenericMedia,
    insertionPosition,
    referenceItemId,
  );
}
