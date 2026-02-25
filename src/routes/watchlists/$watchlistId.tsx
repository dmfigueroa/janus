import { getWatchlistById } from "@/routes/watchlists/-watchlists.server";
import { createFileRoute } from "@tanstack/react-router";
import { WatchlistDetail as WatchlistDetailView } from "@/components/watchlist/WatchlistDetail";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: ({ params: { watchlistId } }) => {
    return getWatchlistById({
      data: { id: parseInt(watchlistId, 10), page: 1, limit: 50, isWatched: false },
    });
  },
  component: WatchlistDetail,
});

export function WatchlistDetail() {
  const initialData = Route.useLoaderData();
  return <WatchlistDetailView initialData={initialData} />;
}
