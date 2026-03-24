import { loadWatchlistDetailRoute } from "@/features/watchlists/detail/query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { WatchlistDetail as WatchlistDetailView } from "@/components/watchlist/WatchlistDetail";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ context, params: { watchlistId } }) => {
    const detail = await loadWatchlistDetailRoute({
      queryClient: context.queryClient,
      filters: { watchlistId: Number.parseInt(watchlistId, 10), unwatchedOnly: true },
    });

    if (!detail) {
      throw notFound();
    }

    return detail;
  },
  component: WatchlistDetail,
});

export function WatchlistDetail() {
  const initialData = Route.useLoaderData();
  return <WatchlistDetailView initialData={initialData} />;
}
