import type { WatchlistMedia } from "@/features/watchlists/mutations";
import { getGameDetails } from "@/server/providers/rawg.server";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";
import { addGenericItemToWatchlist } from "./add-generic.server";

const RAWG_UNAVAILABLE_MESSAGE =
  "Game additions are unavailable because the RAWG integration is not configured.";
const RAWG_FETCH_FAILURE_MESSAGE = "Failed to fetch game details from RAWG.";

export async function addGameToWatchlist(
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
