import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
import { ItemPreview } from "@/features/watchlists/components/item-preview";
import { useMoveWatchlistParentMutation } from "./use-move-watchlist-parent";
import { useWatchlistListQuery } from "./use-watchlist-list-query";
import type { InsertionPosition } from "@/features/watchlists/insert-ordered-item.server";
import { WatchlistSelector } from "./watchlist-selector";
import { PositionPicker } from "./position-picker";
import { AutoOrderingNotice } from "./auto-ordering-notice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type MoveParentDialogProps = {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedWatchlistId: number | null;
  onSelectedWatchlistIdChange: (id: number | null) => void;
  selectedPosition: InsertionPosition;
  onSelectedPositionChange: (position: InsertionPosition) => void;
  preview?: { count: number; watchedCount: number };
  title: string;
};

export function MoveParentDialog({
  item,
  activeFilters,
  open,
  onOpenChange,
  selectedWatchlistId,
  onSelectedWatchlistIdChange,
  selectedPosition,
  onSelectedPositionChange,
  preview,
  title,
}: MoveParentDialogProps) {
  const listQuery = useWatchlistListQuery({ enabled: open });
  const moveMutation = useMoveWatchlistParentMutation({ item, activeFilters, preview });

  const otherWatchlists = filterOtherWatchlists(listQuery.data, item.watchlistId);

  const selectedWatchlist = otherWatchlists.find((wl) => wl.id === selectedWatchlistId);
  const isCustomOrdered = selectedWatchlist?.itemOrderMode === "custom";

  const handleMove = () => {
    if (selectedWatchlistId === null) return;
    moveMutation.mutate(
      {
        destinationWatchlistId: selectedWatchlistId,
        position: isCustomOrdered ? selectedPosition : undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[80vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Select a watchlist to move this group to.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 min-h-0">
          <ItemPreview item={item} />
          <WatchlistSelector
            watchlists={otherWatchlists}
            selectedId={selectedWatchlistId}
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            onSelect={onSelectedWatchlistIdChange}
          />
          {selectedWatchlistId !== null && isCustomOrdered && (
            <PositionPicker value={selectedPosition} onChange={onSelectedPositionChange} />
          )}
          {selectedWatchlistId !== null && !isCustomOrdered && <AutoOrderingNotice />}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={moveMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={selectedWatchlistId === null || moveMutation.isPending || listQuery.isLoading}
            onClick={() => void handleMove()}
          >
            {moveMutation.isPending ? "Moving..." : "Move"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function filterOtherWatchlists(data: unknown, currentWatchlistId: number) {
  if (!Array.isArray(data)) return [];
  return data.filter((wl) => wl.id !== currentWatchlistId);
}
