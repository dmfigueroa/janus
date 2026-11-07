import { providerAdditionFailure } from "./ProviderAdditionFailure.server";
import type { WatchlistMedia } from "./Mutation";
import { getGameDetails } from "@/server/providers/Rawg.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { rejectAdd, type WatchlistWriteResult } from "./AdditionOutcome";
import { addGenericItemToWatchlist } from "./AddGeneric.server";

const RAWG_UNAVAILABLE_MESSAGE =
  "Game additions are unavailable because the RAWG integration is not configured.";

export async function addGameToWatchlist(
  watchlistId: number,
  media: WatchlistMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    return rejectAdd(RAWG_UNAVAILABLE_MESSAGE, "provider_not_configured");
  }

  let details: Awaited<ReturnType<typeof getGameDetails>>;
  try {
    details = await getGameDetails(media.id, apiKey);
  } catch (error) {
    return providerAdditionFailure(error, "RAWG");
  }
  return addGenericItemToWatchlist(watchlistId, details, insertionPosition, referenceItemId);
}
