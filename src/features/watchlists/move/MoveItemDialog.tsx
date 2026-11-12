import type { WatchlistItem } from "@/db/Schema";
import { useMoveWatchlistItemMutation } from "./useMoveWatchlistItem";
import { MoveWatchlistDialog } from "./MoveWatchlistDialog";

type MoveItemDialogProps = {
  item: WatchlistItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MoveItemDialog({ item, open, onOpenChange }: MoveItemDialogProps) {
  const moveMutation = useMoveWatchlistItemMutation({ item });

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
