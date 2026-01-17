import { getWatchlistById } from "@/server/watchlists";
import { createFileRoute } from "@tanstack/react-router";
import { WatchlistHeader } from "@/components/watchlist/WatchlistHeader";
import { WatchlistTimeline } from "@/components/watchlist/WatchlistTimeline";
import { useState } from "react";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ params: { watchlistId } }) => {
    const { watchlist, items } = await getWatchlistById({
      data: { id: parseInt(watchlistId) },
    });

    return { watchlist, items };
  },
  component: WatchlistDetail,
});

function WatchlistDetail() {
  const { watchlist, items } = Route.useLoaderData();
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(false);

  const totalItems = items.length;
  const watchedItems = items.filter((i) => i.isWatched).length;

  const displayedItems = showUnwatchedOnly ? items.filter((i) => !i.isWatched) : items;

  return (
    <div className="container mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-8 pb-32">
      <WatchlistHeader
        watchlist={watchlist}
        totalItems={totalItems}
        watchedItems={watchedItems}
        showUnwatchedOnly={showUnwatchedOnly}
        onToggleFilter={() => setShowUnwatchedOnly((prev) => !prev)}
      />

      <div className="mt-8">
        <WatchlistTimeline items={displayedItems} />
      </div>
    </div>
  );
}
