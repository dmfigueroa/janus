import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRemoveWatchlistItemMutation } from "./use-remove-watchlist-item";
import { useRemoveWatchlistParentMutation } from "./use-remove-watchlist-parent";

type RemovalDialogProps = {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ItemRemovalDialog({
  item,
  activeFilters,
  label,
  open,
  onOpenChange,
}: RemovalDialogProps) {
  const mutation = useRemoveWatchlistItemMutation({ item, activeFilters });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <strong>{item.title}</strong> from this watchlist.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              void mutation.mutateAsync().then(() => onOpenChange(false));
            }}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ParentRemovalDialog({
  item,
  activeFilters,
  label,
  open,
  onOpenChange,
  previewQuery,
}: RemovalDialogProps & {
  previewQuery: {
    data?: { count: number; watchedCount: number };
    isLoading: boolean;
  };
}) {
  const mutation = useRemoveWatchlistParentMutation({
    item,
    activeFilters,
    preview: previewQuery.data,
  });
  const description = getParentRemovalDescription({
    parentTitle: item.parentTitle ?? item.title,
    preview: previewQuery.data,
    isLoading: previewQuery.isLoading,
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              void mutation.mutateAsync().then(() => onOpenChange(false));
            }}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getParentRemovalDescription({
  parentTitle,
  preview,
  isLoading,
}: {
  parentTitle: string;
  preview?: { count: number; watchedCount: number };
  isLoading: boolean;
}) {
  if (isLoading) {
    return `Checking how many items from ${parentTitle} will be removed...`;
  }

  return preview
    ? `This will remove ${preview.count} items from ${parentTitle}, including ${preview.watchedCount} watched.`
    : `This will remove ${parentTitle} from this watchlist. The affected item count is unavailable.`;
}
