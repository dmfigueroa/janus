import { WatchlistCard } from "@/components/WatchlistCard";
import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { CreateWatchlistTile } from "@/features/watchlists/home/create-watchlist-tile";

type AllWatchlistsSectionProps = {
  watchlists: WatchlistHomeQueryData["allWatchlists"];
  selectionMode: boolean;
  selectedIdSet: Set<number>;
  onToggleSelectedWatchlist: (watchlistId: number) => void;
};

export function AllWatchlistsSection({
  watchlists,
  selectionMode,
  selectedIdSet,
  onToggleSelectedWatchlist,
}: AllWatchlistsSectionProps) {
  return (
    <section className="px-6">
      {!selectionMode ? (
        <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">All Watchlists</h2>
      ) : null}
      <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-start sm:gap-6">
        {watchlists.map((watchlist) => (
          <div key={watchlist.id} className="w-full sm:w-55">
            <WatchlistCard
              watchlist={watchlist}
              selectionMode={selectionMode}
              isSelected={selectedIdSet.has(watchlist.id)}
              onToggle={() => onToggleSelectedWatchlist(watchlist.id)}
            />
          </div>
        ))}

        {!selectionMode ? <CreateWatchlistTile /> : null}
      </div>
    </section>
  );
}
