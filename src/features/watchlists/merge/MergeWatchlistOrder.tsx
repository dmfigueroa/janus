import { Button } from "@/components/ui/Button";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";

interface MergeWatchlistOrderProps {
  watchlists: WatchlistSummary[];
  hasCustomOrderedSelection: boolean;
  isSubmitting: boolean;
  onMove: (watchlistId: number, direction: "up" | "down") => void;
}

export function MergeWatchlistOrder({
  watchlists,
  hasCustomOrderedSelection,
  isSubmitting,
  onMove,
}: MergeWatchlistOrderProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Merge order</p>
        <p className="text-xs text-muted-foreground">
          {hasCustomOrderedSelection
            ? "This order sets the final custom ranking when any selected list uses custom order."
            : "This order is kept for the selected lists and release ordering still applies within each list."}
        </p>
      </div>

      <ol className="mt-3 space-y-2">
        {watchlists.map((watchlist, index) => (
          <MergeWatchlistOrderItem
            key={watchlist.id}
            watchlist={watchlist}
            index={index}
            watchlistCount={watchlists.length}
            isSubmitting={isSubmitting}
            onMove={onMove}
          />
        ))}
      </ol>
    </div>
  );
}

function MergeWatchlistOrderItem({
  watchlist,
  index,
  watchlistCount,
  isSubmitting,
  onMove,
}: {
  watchlist: WatchlistSummary;
  index: number;
  watchlistCount: number;
  isSubmitting: boolean;
  onMove: MergeWatchlistOrderProps["onMove"];
}) {
  return (
    <li
      data-testid={`merge-order-item-${watchlist.id}`}
      className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{watchlist.name}</p>
        <p className="text-xs text-muted-foreground">
          {getOrderModeLabel(watchlist.itemOrderMode)}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onMove(watchlist.id, "up")}
          disabled={isMoveUpDisabled(isSubmitting, index)}
          aria-label={`Move ${watchlist.name} up`}
        >
          Up
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onMove(watchlist.id, "down")}
          disabled={isMoveDownDisabled(isSubmitting, index, watchlistCount)}
          aria-label={`Move ${watchlist.name} down`}
        >
          Down
        </Button>
      </div>
    </li>
  );
}

function getOrderModeLabel(itemOrderMode: WatchlistSummary["itemOrderMode"]) {
  return itemOrderMode === "custom" ? "Custom order" : "Release order";
}

function isMoveUpDisabled(isSubmitting: boolean, index: number) {
  return isSubmitting || index === 0;
}

function isMoveDownDisabled(isSubmitting: boolean, index: number, watchlistCount: number) {
  return isSubmitting || index === watchlistCount - 1;
}
