import { EditWatchlistItemDialog } from "./edit-watchlist-item-dialog";
import { useState } from "react";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
import { MoveItemDialog } from "@/features/watchlists/move/move-item-dialog";
import type { InsertionPosition } from "@/features/watchlists/insert-ordered-item.server";
import { useToggleWatchedItem } from "@/features/watchlists/detail/use-toggle-watched-item";
import { MoveParentDialog } from "@/features/watchlists/move/move-parent-dialog";
import {
  ItemRemovalDialog,
  ParentRemovalDialog,
} from "@/features/watchlists/remove/removal-dialogs";
import { useParentRemovalPreview } from "@/features/watchlists/remove/use-parent-removal-preview";
import { getTimelineItemActionLabels, TimelineItemActionMenu } from "./timeline-item-action-menu";

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
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const [selectedParentWatchlistId, setSelectedParentWatchlistId] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<InsertionPosition>("end");
  const [selectedParentPosition, setSelectedParentPosition] = useState<InsertionPosition>("end");
  const labels = getTimelineItemActionLabels(item);
  const quietWatchMutation = useToggleWatchedItem(item, { updateWatchlistRecency: false });
  const parentPreviewQuery = useParentRemovalPreview({
    watchlistId: item.watchlistId,
    parentId: item.parentId,
    enabled: removeParentOpen || moveParentOpen,
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
        onMoveItem={() => {
          setSelectedWatchlistId(null);
          setSelectedPosition("end");
          setMoveItemOpen(true);
        }}
        onMoveParent={() => {
          setSelectedParentWatchlistId(null);
          setSelectedParentPosition("end");
          setMoveParentOpen(true);
        }}
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
        selectedWatchlistId={selectedWatchlistId}
        onSelectedWatchlistIdChange={setSelectedWatchlistId}
        selectedPosition={selectedPosition}
        onSelectedPositionChange={setSelectedPosition}
      />

      <MoveParentDialog
        item={item}
        activeFilters={activeFilters}
        open={moveParentOpen}
        onOpenChange={setMoveParentOpen}
        selectedWatchlistId={selectedParentWatchlistId}
        onSelectedWatchlistIdChange={setSelectedParentWatchlistId}
        selectedPosition={selectedParentPosition}
        onSelectedPositionChange={setSelectedParentPosition}
        preview={parentPreviewQuery.data}
        title={labels.moveParent}
      />
    </>
  );
}
