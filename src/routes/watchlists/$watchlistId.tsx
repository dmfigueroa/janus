import { getWatchlistDetails } from "@/server/watchlist";
import { getWatchlists } from "@/server/watchlists";
import { createFileRoute } from "@tanstack/react-router";
import { WatchlistHeader } from "@/components/watchlist/WatchlistHeader";
import { WatchlistTimeline } from "@/components/watchlist/WatchlistTimeline";
import { useState } from "react";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ params: { watchlistId } }) => {
    // We need both the watchlist metadata and the items
    // Efficient way: Fetch lists to find name (or add a getWatchlist(id) fn), and getDetails.
    // For now, let's just reuse getWatchlists to find the current one, and getDetails.

    // In a real app we'd have getWatchlistById. Let's filter from getWatchlists for now to avoid creating another server fn if not strictly needed yet, OR we should add it.
    // Actually, getWatchlists is cheap.

    const [lists, items] = await Promise.all([
      getWatchlists(),
      getWatchlistDetails({ data: { watchlistId: parseInt(watchlistId) } }),
    ]);

    const currentList = lists.find((l) => l.id === parseInt(watchlistId));

    if (!currentList) {
      throw new Error("Watchlist not found");
    }

    return { watchlist: currentList, items };
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
