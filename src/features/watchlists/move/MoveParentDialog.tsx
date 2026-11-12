import type { WatchlistItem } from "@/db/Schema";
import { useMoveWatchlistParentMutation } from "./useMoveWatchlistParent";
import { useParentRemovalPreview } from "@/features/watchlists/remove/RemoveFromWatchlist";
import { MoveWatchlistDialog } from "./MoveWatchlistDialog";

type MoveParentDialogProps = {
  item: WatchlistItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
};

export function MoveParentDialog({ item, open, onOpenChange, title }: MoveParentDialogProps) {
  const previewQuery = useParentRemovalPreview({
    watchlistId: item.watchlistId,
    parentId: item.parentId,
    enabled: open,
  });
  const moveMutation = useMoveWatchlistParentMutation({
    item,
    preview: previewQuery.data,
  });

  return (
    <MoveWatchlistDialog
      item={item}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Select a watchlist to move this group to."
      mutation={moveMutation}
    />
  );
}
