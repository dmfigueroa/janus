import {
  getWatchlistDetailPage,
  watchlistDetailQueryKey,
} from "@/features/watchlists/detail/Query";
import { WatchlistDetailScreen } from "@/features/watchlists/detail/WatchlistDetailScreen";
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ context, params: { watchlistId } }) => {
    const filters = { watchlistId: Number.parseInt(watchlistId, 10), unwatchedOnly: false };
    const detail = await getWatchlistDetailPage({
      data: { ...filters, cursor: 1 },
    });

    if (!detail) {
      throw notFound();
    }

    context.queryClient.setQueryData(
      watchlistDetailQueryKey({
        ...filters,
        itemOrderMode: detail.watchlist.itemOrderMode,
      }),
      {
        pages: [detail],
        pageParams: [1],
      },
    );

    return detail;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.watchlist.name ?? "Watchlist"} - Janus` }],
  }),
  component: WatchlistDetail,
});

export function WatchlistDetail() {
  const initialData = Route.useLoaderData();
  return <WatchlistDetailScreen initialData={initialData} />;
}
