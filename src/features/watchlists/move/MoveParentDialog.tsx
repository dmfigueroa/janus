import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import { useMoveWatchlistParentMutation } from "./useMoveWatchlistParent";
import { useWatchlistListQuery } from "./useWatchlistListQuery";
import type { InsertionPosition } from "@/features/watchlists/Order";
import { MoveWatchlistDialogContent } from "./MoveWatchlistDialogContent";

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
    <MoveWatchlistDialogContent
      item={item}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Select a watchlist to move this group to."
      watchlists={otherWatchlists}
      selectedWatchlistId={selectedWatchlistId}
      onSelectedWatchlistIdChange={onSelectedWatchlistIdChange}
      selectedPosition={selectedPosition}
      onSelectedPositionChange={onSelectedPositionChange}
      isCustomOrdered={isCustomOrdered}
      isLoading={listQuery.isLoading}
      isError={listQuery.isError}
      isPending={moveMutation.isPending}
      onMove={handleMove}
    />
  );
}

function filterOtherWatchlists(data: unknown, currentWatchlistId: number) {
  if (!Array.isArray(data)) return [];
  return data.filter((wl) => wl.id !== currentWatchlistId);
}
