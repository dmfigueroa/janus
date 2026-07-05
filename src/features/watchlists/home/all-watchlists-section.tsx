import { WatchlistCard } from "@/components/WatchlistCard";
import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { CreateWatchlistTile } from "@/features/watchlists/home/create-watchlist-tile";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/watchlist-merge-selection-context";

type AllWatchlistsSectionProps = {
  watchlists: WatchlistHomeQueryData["allWatchlists"];
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
