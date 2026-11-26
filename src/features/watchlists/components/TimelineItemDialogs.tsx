import type { ComponentType } from "react";
import type { WatchlistItem } from "@/db/Schema";
import { MoveItemDialog } from "@/features/watchlists/move/MoveItemDialog";
import { MoveParentDialog } from "@/features/watchlists/move/MoveParentDialog";
import {
  ItemRemovalDialog,
  ParentRemovalDialog,
} from "@/features/watchlists/remove/RemovalDialogs";
import { useParentRemovalPreview } from "@/features/watchlists/remove/RemoveFromWatchlist";
import type { TimelineItemActionLabels } from "./TimelineItemActionMenu";
import { EditWatchlistItemDialog } from "./EditWatchlistItemDialog";

export type ActiveItemDialog = "edit" | "removeItem" | "removeParent" | "moveItem" | "moveParent";

type ItemDialogProps = {
  item: WatchlistItem;
  labels: TimelineItemActionLabels;
  onOpenChange: (open: boolean) => void;
};

export function TimelineItemDialogs({
  item,
  labels,
  activeDialog,
  onClose,
}: {
  item: WatchlistItem;
  labels: TimelineItemActionLabels;
  activeDialog: ActiveItemDialog | null;
  onClose: () => void;
}) {
  if (!activeDialog) return null;
  const ActiveDialog = DIALOG_COMPONENTS[activeDialog];
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  return <ActiveDialog item={item} labels={labels} onOpenChange={handleOpenChange} />;
}

function EditItemDialogEntry({ item, onOpenChange }: ItemDialogProps) {
  return <EditWatchlistItemDialog item={item} open onOpenChange={onOpenChange} />;
}

function RemoveItemDialogEntry({ item, labels, onOpenChange }: ItemDialogProps) {
  return <ItemRemovalDialog item={item} label={labels.item} open onOpenChange={onOpenChange} />;
}

function RemoveParentDialogEntry({ item, labels, onOpenChange }: ItemDialogProps) {
  const previewQuery = useParentRemovalPreview({
    watchlistId: item.watchlistId,
    parentId: item.parentId,
    enabled: true,
  });
  return (
    <ParentRemovalDialog
      item={item}
      label={labels.parent}
      open
      onOpenChange={onOpenChange}
      previewQuery={previewQuery}
    />
  );
}

function MoveItemDialogEntry({ item, onOpenChange }: ItemDialogProps) {
  return <MoveItemDialog item={item} open onOpenChange={onOpenChange} />;
}

function MoveParentDialogEntry({ item, labels, onOpenChange }: ItemDialogProps) {
  return (
    <MoveParentDialog item={item} open onOpenChange={onOpenChange} title={labels.moveParent} />
  );
}

const DIALOG_COMPONENTS: Record<ActiveItemDialog, ComponentType<ItemDialogProps>> = {
  edit: EditItemDialogEntry,
  removeItem: RemoveItemDialogEntry,
  removeParent: RemoveParentDialogEntry,
  moveItem: MoveItemDialogEntry,
  moveParent: MoveParentDialogEntry,
};
