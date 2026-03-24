import { getWatchlistDetail } from "@/controllers/watchlists";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { WatchlistDetail as WatchlistDetailView } from "@/components/watchlist/WatchlistDetail";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ params: { watchlistId } }) => {
    const detail = await getWatchlistDetail({
      data: { watchlistId: Number.parseInt(watchlistId, 10), unwatchedOnly: true },
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
