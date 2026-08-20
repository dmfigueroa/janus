import { WatchlistCard } from "@/components/WatchlistCard";
import type { getWatchlistHome } from "@/features/watchlists/home/WatchlistHome";
import { CreateWatchlistTile } from "@/features/watchlists/home/CreateWatchlistTile";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/WatchlistMergeSelectionContext";

type AllWatchlistsSectionProps = {
  watchlists: Awaited<ReturnType<typeof getWatchlistHome>>["allWatchlists"];
};

export function AllWatchlistsSection({ watchlists }: AllWatchlistsSectionProps) {
  const mergeSelection = useWatchlistMergeSelectionContext();

  return (
    <section className="px-6">
      {!mergeSelection.selectionMode ? (
        <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">All Watchlists</h2>
      ) : null}
      <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-start sm:gap-6">
        {watchlists.map((watchlist) => (
          <div key={watchlist.id} className="w-full sm:w-55">
            <WatchlistCard
              watchlist={watchlist}
              selectionMode={mergeSelection.selectionMode}
              isSelected={mergeSelection.selectedIdSet.has(watchlist.id)}
              onToggle={() => mergeSelection.toggleSelectedWatchlist(watchlist.id)}
            />
          </div>
        ))}

        {!mergeSelection.selectionMode ? <CreateWatchlistTile /> : null}
      </div>
    </section>
  );
}
