import { watchlistDetailInfiniteQueryOptions } from "@/features/watchlists/detail/Query";
import { WatchlistDetailScreen } from "@/features/watchlists/detail/WatchlistDetailScreen";
import { parsePositiveIntegerParam } from "@/shared/RouteParams";
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  beforeLoad: ({ params: { watchlistId } }) => {
    const parsedWatchlistId = parsePositiveIntegerParam(watchlistId);
    if (parsedWatchlistId === null) {
      throw notFound();
    }

    return { watchlistId: parsedWatchlistId };
  },
  loader: async ({ context }) => {
    const detail = await context.queryClient.ensureInfiniteQueryData({
      ...watchlistDetailInfiniteQueryOptions({
        watchlistId: context.watchlistId,
        unwatchedOnly: false,
      }),
      revalidateIfStale: true,
    });

    const firstPage = detail.pages[0];
    if (!firstPage) {
      throw notFound();
    }

    return { watchlistName: firstPage.watchlist.name };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.watchlistName ?? "Watchlist"} - Janus` }],
  }),
  component: WatchlistDetail,
});

export function WatchlistDetail() {
  const { watchlistId } = Route.useRouteContext();
  return <WatchlistDetailScreen watchlistId={watchlistId} />;
}
