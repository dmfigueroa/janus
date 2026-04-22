import {
  getWatchlistDetailPage,
  watchlistDetailQueryKey,
} from "@/features/watchlists/detail/query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { WatchlistDetail as WatchlistDetailView } from "@/components/watchlist/WatchlistDetail";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ context, params: { watchlistId } }) => {
    const parsedWatchlistId = parseInt(watchlistId, 10);

    if (
      !Number.isSafeInteger(parsedWatchlistId) ||
      parsedWatchlistId <= 0 ||
      String(parsedWatchlistId) !== watchlistId
    ) {
      throw notFound();
    }

    const filters = { watchlistId: parsedWatchlistId, unwatchedOnly: true };
    const detail = await getWatchlistDetailPage({
      data: { ...filters, cursor: 1 },
    });

    if (!detail) {
      throw notFound();
    }

    context.queryClient.setQueryData(watchlistDetailQueryKey(filters), {
      pages: [detail],
      pageParams: [1],
    });

    return detail;
  },
  component: WatchlistDetail,
});

export function WatchlistDetail() {
  const initialData = Route.useLoaderData();
  return <WatchlistDetailView initialData={initialData} />;
}
