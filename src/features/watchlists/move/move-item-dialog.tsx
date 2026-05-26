import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
import { ItemPreview } from "@/features/watchlists/components/item-preview";
import { useMoveWatchlistItemMutation } from "./use-move-watchlist-item";
import { useWatchlistListQuery } from "./use-watchlist-list-query";
import { useMoveDialogState } from "./use-move-dialog-state";
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

type MoveItemDialogProps = {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MoveItemDialog({ item, activeFilters, open, onOpenChange }: MoveItemDialogProps) {
  const listQuery = useWatchlistListQuery({ enabled: open });
  const moveMutation = useMoveWatchlistItemMutation({ item, activeFilters });
  const {
    selectedWatchlistId: selectedId,
    setSelectedWatchlistId: setSelectedId,
    selectedPosition,
    setSelectedPosition,
  } = useMoveDialogState(open);

  const otherWatchlists = Array.isArray(listQuery.data)
    ? listQuery.data.filter((wl) => wl.id !== item.watchlistId)
    : [];

  const selectedWatchlist = otherWatchlists.find((wl) => wl.id === selectedId);
  const isCustomOrdered = selectedWatchlist?.itemOrderMode === "custom";

  const handleMove = () => {
    if (selectedId === null) return;
    moveMutation.mutate(
      {
        destinationWatchlistId: selectedId,
        position: isCustomOrdered ? selectedPosition : undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[80vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>Move to another watchlist</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Select a watchlist to move this item to.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 min-h-0">
          <ItemPreview item={item} />
          <WatchlistSelector
            watchlists={otherWatchlists}
            selectedId={selectedId}
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            onSelect={setSelectedId}
          />
          {selectedId !== null && isCustomOrdered && (
            <PositionPicker value={selectedPosition} onChange={setSelectedPosition} />
          )}
          {selectedId !== null && !isCustomOrdered && <AutoOrderingNotice />}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={moveMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={selectedId === null || moveMutation.isPending || listQuery.isLoading}
            onClick={() => void handleMove()}
          >
            {moveMutation.isPending ? "Moving..." : "Move"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
