import type { AddToWatchlistInput, GenericMedia } from "@/features/watchlists/mutations";
import { getDeprecatedWatchlistAddRejection } from "@/server/media";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";
import { addTVShowToWatchlist } from "./add-tv.server";
import { addMovieToWatchlist } from "./add-movie.server";
import { addComicToWatchlist } from "./add-comic.server";
import { addBookToWatchlist } from "./add-book.server";
import { addGameToWatchlist } from "./add-game.server";
import { addGenericItemToWatchlist } from "./add-generic.server";

const UNSUPPORTED_TV_SOURCE_MESSAGE =
  "TV shows must come from TMDB so Janus can expand them into episodes.";

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
