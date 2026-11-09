import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import { useMoveWatchlistParentMutation } from "./useMoveWatchlistParent";
import { useParentRemovalPreview } from "@/features/watchlists/remove/useParentRemovalPreview";
import { MoveWatchlistDialog } from "./MoveWatchlistDialog";

type MoveParentDialogProps = {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
};

export function MoveParentDialog({
  item,
  activeFilters,
  open,
  onOpenChange,
  title,
}: MoveParentDialogProps) {
  const previewQuery = useParentRemovalPreview({
    watchlistId: item.watchlistId,
    parentId: item.parentId,
    enabled: open,
  });
  const moveMutation = useMoveWatchlistParentMutation({
    item,
    activeFilters,
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
