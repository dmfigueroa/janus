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

/**
 * Dialogs mount only while open. Every mounted row would otherwise build five dialog
 * roots, their providers, and their mutation hooks that no one ever opens.
 */
export function TimelineItemDialogs({
  item,
  labels,
  openDialogs,
  onOpenChange,
}: {
  item: WatchlistItem;
  labels: TimelineItemActionLabels;
  openDialogs: OpenDialogs;
  onOpenChange: (dialogs: Partial<OpenDialogs>) => void;
}) {
  return (
    <>
      <LazyEditItemDialog
        item={item}
        isOpen={openDialogs.edit}
        onOpenChange={(open) => onOpenChange({ edit: open })}
      />
      <LazyItemRemovalDialog
        item={item}
        label={labels.item}
        isOpen={openDialogs.removeItem}
        onOpenChange={(open) => onOpenChange({ removeItem: open })}
      />
      <LazyParentRemovalDialog
        item={item}
        label={labels.parent}
        isOpen={openDialogs.removeParent}
        onOpenChange={(open) => onOpenChange({ removeParent: open })}
      />
      <LazyMoveItemDialog
        item={item}
        isOpen={openDialogs.moveItem}
        onOpenChange={(open) => onOpenChange({ moveItem: open })}
      />
      <LazyMoveParentDialog
        item={item}
        title={labels.moveParent}
        isOpen={openDialogs.moveParent}
        onOpenChange={(open) => onOpenChange({ moveParent: open })}
      />
    </>
  );
}

export type OpenDialogs = {
  edit: boolean;
  removeItem: boolean;
  removeParent: boolean;
  moveItem: boolean;
  moveParent: boolean;
};

function LazyEditItemDialog({
  item,
  isOpen,
  onOpenChange,
}: {
  item: WatchlistItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!isOpen) return null;
  return <EditWatchlistItemDialog item={item} open onOpenChange={onOpenChange} />;
}

function LazyItemRemovalDialog({
  item,
  label,
  isOpen,
  onOpenChange,
}: {
  item: WatchlistItem;
  label: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!isOpen) return null;
  return <ItemRemovalDialog item={item} label={label} open onOpenChange={onOpenChange} />;
}

function LazyParentRemovalDialog({
  item,
  label,
  isOpen,
  onOpenChange,
}: {
  item: WatchlistItem;
  label: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!isOpen) return null;
  return <ParentRemovalDialogLauncher item={item} label={label} onOpenChange={onOpenChange} />;
}

function ParentRemovalDialogLauncher({
  item,
  label,
  onOpenChange,
}: {
  item: WatchlistItem;
  label: string;
  onOpenChange: (open: boolean) => void;
}) {
  const previewQuery = useParentRemovalPreview({
    watchlistId: item.watchlistId,
    parentId: item.parentId,
    enabled: true,
  });
  return (
    <ParentRemovalDialog
      item={item}
      label={label}
      open
      onOpenChange={onOpenChange}
      previewQuery={previewQuery}
    />
  );
}

function LazyMoveItemDialog({
  item,
  isOpen,
  onOpenChange,
}: {
  item: WatchlistItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!isOpen) return null;
  return <MoveItemDialog item={item} open onOpenChange={onOpenChange} />;
}

function LazyMoveParentDialog({
  item,
  title,
  isOpen,
  onOpenChange,
}: {
  item: WatchlistItem;
  title: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!isOpen) return null;
  return <MoveParentDialog item={item} open onOpenChange={onOpenChange} title={title} />;
}
