import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/watchlist-merge-selection-context";

type HomeHeaderProps = {
  totals: WatchlistHomeQueryData["totals"];
};

export function HomeHeader({ totals }: HomeHeaderProps) {
  const mergeSelection = useWatchlistMergeSelectionContext();
  const selectedCount = mergeSelection.selectedIds.length;

  return (
    <header className="px-6 pb-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {mergeSelection.selectionMode ? `${selectedCount} Selected` : "My Lists"}
        </h1>
        <div className="flex gap-2">
          {mergeSelection.selectionMode ? (
            <>
              <Button variant="ghost" onClick={mergeSelection.clearSelection}>
                Cancel
              </Button>
              <Button disabled={selectedCount < 2} onClick={mergeSelection.openMergeDialog}>
                Merge
              </Button>
            </>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full bg-card text-muted-foreground hover:bg-secondary"
              onClick={mergeSelection.enterSelectionMode}
              aria-label="Select watchlists"
              title="Select watchlists"
            >
              <CheckSquare className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {!mergeSelection.selectionMode ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {totals.watchlists} watchlists, {totals.items} items
        </p>
      ) : null}
    </header>
  );
}
