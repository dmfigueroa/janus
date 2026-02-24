import { getWatchlistById } from "@/server/watchlists";
import { createFileRoute } from "@tanstack/react-router";
import { WatchlistDetail as WatchlistDetailView } from "@/components/watchlist/WatchlistDetail";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ params: { watchlistId } }) => {
    return await getWatchlistById({
      data: { id: parseInt(watchlistId), page: 1, limit: 50 },
    });
  },
  component: WatchlistDetail,
});

export function WatchlistDetail() {
  const initialData = Route.useLoaderData();
  return <WatchlistDetailView initialData={initialData} />;
}
