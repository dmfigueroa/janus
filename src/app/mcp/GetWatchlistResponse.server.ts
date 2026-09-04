import { getWatchlistOrderState } from "@/features/watchlists/order/SetWatchlistOrder.server";
import { discoverWatchlistPage } from "@/features/watchlists/detail/DiscoverWatchlist.server";
import { asMcpContent, asMcpError } from "./McpToolResponse.server";
import { respondToWatchlistTitles } from "./WatchlistTitleResponse.server";
import { toMcpWatchlistItem } from "./WatchlistItemResponse.server";

export async function getWatchlistResponse({
  watchlistId,
  pageSize,
  cursor,
  resultView,
}: {
  watchlistId: number;
  pageSize?: number;
  cursor?: string;
  resultView?: "items" | "titles";
}) {
  return resultView === "titles"
    ? respondToWatchlistTitles({ watchlistId, pageSize, cursor })
    : getWatchlistItemsResponse({ watchlistId, pageSize, cursor });
}

async function getWatchlistItemsResponse({
  watchlistId,
  pageSize,
  cursor,
}: {
  watchlistId: number;
  pageSize?: number;
  cursor?: string;
}) {
  const orderState = await getWatchlistOrderState(watchlistId);
  if (!orderState) return asMcpError(`Watchlist ${watchlistId} was not found.`);
  const page = await discoverWatchlistPage({ watchlistId, pageSize, cursor });
  if (!page) return asMcpError(`Watchlist ${watchlistId} was not found.`);
  return asMcpContent({
    watchlist: page.watchlist,
    items: page.items.map(toMcpWatchlistItem),
    nextCursor: page.nextCursor,
    orderToken: orderState.orderToken,
  });
}
