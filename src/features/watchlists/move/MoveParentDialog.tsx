import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import { ItemPreview } from "@/features/watchlists/components/ItemPreview";
import { useMoveWatchlistParentMutation } from "./useMoveWatchlistParent";
import { useWatchlistListQuery } from "./useWatchlistListQuery";
import type { InsertionPosition } from "@/features/watchlists/InsertOrderedItem.server";
import { WatchlistSelector } from "./WatchlistSelector";
import { PositionPicker } from "./PositionPicker";
import { AutoOrderingNotice } from "./AutoOrderingNotice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";

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
    <MoveParentDialogContent
      item={item}
      open={open}
      onOpenChange={onOpenChange}
      otherWatchlists={otherWatchlists}
      selectedWatchlistId={selectedWatchlistId}
      onSelectedWatchlistIdChange={onSelectedWatchlistIdChange}
      selectedPosition={selectedPosition}
      onSelectedPositionChange={onSelectedPositionChange}
      isCustomOrdered={isCustomOrdered}
      isLoading={listQuery.isLoading}
      isError={listQuery.isError}
      isPending={moveMutation.isPending}
      title={title}
      onMove={handleMove}
    />
  );
}

type MoveParentDialogContentProps = Omit<
  MoveParentDialogProps,
  "activeFilters" | "preview" | "selectedPosition" | "onSelectedPositionChange"
> & {
  otherWatchlists: ReturnType<typeof filterOtherWatchlists>;
  selectedPosition: InsertionPosition;
  onSelectedPositionChange: (position: InsertionPosition) => void;
  isCustomOrdered: boolean;
  isLoading: boolean;
  isError: boolean;
  isPending: boolean;
  onMove: () => void;
};

function MoveParentDialogContent({
  item,
  open,
  onOpenChange,
  otherWatchlists,
  selectedWatchlistId,
  onSelectedWatchlistIdChange,
  selectedPosition,
  onSelectedPositionChange,
  isCustomOrdered,
  isLoading,
  isError,
  isPending,
  title,
  onMove,
}: MoveParentDialogContentProps) {
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
            isLoading={isLoading}
            isError={isError}
            onSelect={onSelectedWatchlistIdChange}
          />
          <DestinationOrdering
            selected={selectedWatchlistId !== null}
            isCustomOrdered={isCustomOrdered}
            selectedPosition={selectedPosition}
            onSelectedPositionChange={onSelectedPositionChange}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isMoveDisabled(selectedWatchlistId, isPending, isLoading)}
            onClick={() => void onMove()}
          >
            {isPending ? "Moving..." : "Move"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DestinationOrdering({
  selected,
  isCustomOrdered,
  selectedPosition,
  onSelectedPositionChange,
}: {
  selected: boolean;
  isCustomOrdered: boolean;
  selectedPosition: InsertionPosition;
  onSelectedPositionChange: (position: InsertionPosition) => void;
}) {
  if (!selected) return null;
  if (!isCustomOrdered) return <AutoOrderingNotice />;
  return <PositionPicker value={selectedPosition} onChange={onSelectedPositionChange} />;
}

function isMoveDisabled(
  selectedWatchlistId: number | null,
  isPending: boolean,
  isLoading: boolean,
) {
  if (selectedWatchlistId === null) return true;
  return isPending || isLoading;
}

function filterOtherWatchlists(data: unknown, currentWatchlistId: number) {
  if (!Array.isArray(data)) return [];
  return data.filter((wl) => wl.id !== currentWatchlistId);
}
