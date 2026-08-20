import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { getWatchlistHome } from "@/features/watchlists/home/WatchlistHome";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/WatchlistMergeSelectionContext";

type HomeHeaderProps = {
  totals: Awaited<ReturnType<typeof getWatchlistHome>>["totals"];
};

export function HomeHeader({ totals }: HomeHeaderProps) {
  const mergeSelection = useWatchlistMergeSelectionContext();
  const selectedCount = mergeSelection.selectedIds.length;

  return (
    <header className="px-6 pb-4 pt-8">
      <div className="flex items-center justify-between">
        <HeaderTitle selectionMode={mergeSelection.selectionMode} selectedCount={selectedCount} />
        <div className="flex gap-2">
          <HeaderActions mergeSelection={mergeSelection} selectedCount={selectedCount} />
        </div>
      </div>

      <WatchlistTotals totals={totals} hidden={mergeSelection.selectionMode} />
    </header>
  );
}

function HeaderTitle({
  selectionMode,
  selectedCount,
}: {
  selectionMode: boolean;
  selectedCount: number;
}) {
  return (
    <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
      {selectionMode ? `${selectedCount} Selected` : "My Lists"}
    </h1>
  );
}

function HeaderActions({
  mergeSelection,
  selectedCount,
}: {
  mergeSelection: ReturnType<typeof useWatchlistMergeSelectionContext>;
  selectedCount: number;
}) {
  if (mergeSelection.selectionMode) {
    return (
      <>
        <Button variant="ghost" onClick={mergeSelection.clearSelection}>
          Cancel
        </Button>
        <Button disabled={selectedCount < 2} onClick={mergeSelection.openMergeDialog}>
          Merge
        </Button>
      </>
    );
  }

  return (
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
  );
}

function WatchlistTotals({ totals, hidden }: HomeHeaderProps & { hidden: boolean }) {
  if (hidden) return null;
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      {totals.watchlists} watchlists, {totals.items} items
    </p>
  );
}
