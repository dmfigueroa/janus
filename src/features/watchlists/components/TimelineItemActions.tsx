import { EditWatchlistItemDialog } from "./EditWatchlistItemDialog";
import { useState } from "react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import { MoveItemDialog } from "@/features/watchlists/move/MoveItemDialog";
import { useToggleWatchedItem } from "@/features/watchlists/detail/useToggleWatchedItem";
import { MoveParentDialog } from "@/features/watchlists/move/MoveParentDialog";
import {
  ItemRemovalDialog,
  ParentRemovalDialog,
} from "@/features/watchlists/remove/RemovalDialogs";
import { useParentRemovalPreview } from "@/features/watchlists/remove/useParentRemovalPreview";
import { getTimelineItemActionLabels, TimelineItemActionMenu } from "./TimelineItemActionMenu";

type TimelineItemActionsProps = {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
  interactionDisabled?: boolean;
};

export function TimelineItemActions({
  item,
  activeFilters,
  interactionDisabled = false,
}: TimelineItemActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [removeItemOpen, setRemoveItemOpen] = useState(false);
  const [removeParentOpen, setRemoveParentOpen] = useState(false);
  const [moveItemOpen, setMoveItemOpen] = useState(false);
  const [moveParentOpen, setMoveParentOpen] = useState(false);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const labels = getTimelineItemActionLabels(item);
  const quietWatchMutation = useToggleWatchedItem(item, { updateWatchlistRecency: false });
  const parentPreviewQuery = useParentRemovalPreview({
    watchlistId: item.watchlistId,
    parentId: item.parentId,
    enabled: removeParentOpen,
  });
  const isBusy = [interactionDisabled, quietWatchMutation.isPending].some(Boolean);

  return (
    <>
      <TimelineItemActionMenu
        item={item}
        labels={labels}
        open={menuOpen}
        disabled={isBusy}
        onOpenChange={setMenuOpen}
        onMarkWatched={quietWatchMutation.mutate}
        onEdit={() => setEditItemOpen(true)}
        onRemoveItem={() => setRemoveItemOpen(true)}
        onRemoveParent={() => setRemoveParentOpen(true)}
        onMoveItem={() => setMoveItemOpen(true)}
        onMoveParent={() => setMoveParentOpen(true)}
      />

      <EditWatchlistItemDialog item={item} open={editItemOpen} onOpenChange={setEditItemOpen} />

      <ItemRemovalDialog
        item={item}
        activeFilters={activeFilters}
        label={labels.item}
        open={removeItemOpen}
        onOpenChange={setRemoveItemOpen}
      />

      <ParentRemovalDialog
        item={item}
        activeFilters={activeFilters}
        label={labels.parent}
        open={removeParentOpen}
        onOpenChange={setRemoveParentOpen}
        previewQuery={parentPreviewQuery}
      />

      <MoveItemDialog
        item={item}
        activeFilters={activeFilters}
        open={moveItemOpen}
        onOpenChange={setMoveItemOpen}
      />

      <MoveParentDialog
        item={item}
        activeFilters={activeFilters}
        open={moveParentOpen}
        onOpenChange={setMoveParentOpen}
        title={labels.moveParent}
      />
    </>
  );
}
