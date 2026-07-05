import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";

type HomeHeaderProps = {
  totals: WatchlistHomeQueryData["totals"];
  selectionMode: boolean;
  selectedCount: number;
  onEnterSelectionMode: () => void;
  onCancelSelection: () => void;
  onOpenMergeDialog: () => void;
};

export function HomeHeader({
  totals,
  selectionMode,
  selectedCount,
  onEnterSelectionMode,
  onCancelSelection,
  onOpenMergeDialog,
}: HomeHeaderProps) {
  return (
    <header className="px-6 pb-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {selectionMode ? `${selectedCount} Selected` : "My Lists"}
        </h1>
        <div className="flex gap-2">
          {selectionMode ? (
            <>
              <Button variant="ghost" onClick={onCancelSelection}>
                Cancel
              </Button>
              <Button disabled={selectedCount < 2} onClick={onOpenMergeDialog}>
                Merge
              </Button>
            </>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full bg-card text-muted-foreground hover:bg-secondary"
              onClick={onEnterSelectionMode}
              aria-label="Select watchlists"
              title="Select watchlists"
            >
              <CheckSquare className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {!selectionMode ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {totals.watchlists} watchlists, {totals.items} items
        </p>
      ) : null}
    </header>
  );
}
