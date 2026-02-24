import { getWatchlistById } from "@/server/watchlists";
import { createFileRoute } from "@tanstack/react-router";
import { WatchlistDetail as WatchlistDetailView } from "@/components/watchlist/WatchlistDetail";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ params: { watchlistId } }) => {
    return await getWatchlistById({
      data: { id: parseInt(watchlistId, 10), page: 1, limit: 50, isWatched: false },
    });
  },
  component: WatchlistDetail,
});

export function WatchlistDetail() {
  const initialData = Route.useLoaderData();
  return <WatchlistDetailView initialData={initialData} />;
}
