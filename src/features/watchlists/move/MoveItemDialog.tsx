import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import { useMoveWatchlistItemMutation } from "./useMoveWatchlistItem";
import { MoveWatchlistDialog } from "./MoveWatchlistDialog";

type MoveItemDialogProps = {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MoveItemDialog({ item, activeFilters, open, onOpenChange }: MoveItemDialogProps) {
  const moveMutation = useMoveWatchlistItemMutation({ item, activeFilters });

  return (
    <MoveWatchlistDialog
      item={item}
      open={open}
      onOpenChange={onOpenChange}
      title="Move to another watchlist"
      description="Select a watchlist to move this item to."
      mutation={moveMutation}
    />
  );
}
