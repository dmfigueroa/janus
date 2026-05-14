import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
import { getWatchlistParentRemovalPreviewQuery } from "@/features/watchlists/remove/query";
import { useRemoveWatchlistItemMutation } from "@/features/watchlists/remove/use-remove-watchlist-item";
import { useRemoveWatchlistParentMutation } from "@/features/watchlists/remove/use-remove-watchlist-parent";

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
  const previewFn = useServerFn(getWatchlistParentRemovalPreviewQuery);
  const labels = getRemovalLabels(item);
  const removeItemMutation = useRemoveWatchlistItemMutation({ item, activeFilters });
  const previewQuery = useQuery({
    queryKey: ["watchlists", "remove-parent-preview", item.watchlistId, item.parentId],
    queryFn: async () => {
      if (!item.parentId) {
        return { count: 0, watchedCount: 0 };
      }

      return previewFn({
        data: {
          watchlistId: item.watchlistId,
          parentId: item.parentId,
        },
      });
    },
    enabled: removeParentOpen && item.parentId !== null,
    retry: false,
  });
  const removeParentMutation = useRemoveWatchlistParentMutation({
    item,
    activeFilters,
    preview: previewQuery.data,
  });
  const isBusy =
    interactionDisabled || removeItemMutation.isPending || removeParentMutation.isPending;

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${item.title}`}
            disabled={isBusy}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground disabled:pointer-events-none"
          >
            <MoreHorizontal size={16} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setMenuOpen(false);
                setRemoveItemOpen(true);
              }}
            >
              {labels.item}
            </Button>

            {item.parentId ? (
              <Button
                type="button"
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setMenuOpen(false);
                  setRemoveParentOpen(true);
                }}
              >
                {labels.parent}
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={removeItemOpen} onOpenChange={setRemoveItemOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.item}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{item.title}</strong> from this watchlist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeItemMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeItemMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void removeItemMutation.mutateAsync().then(() => {
                  setRemoveItemOpen(false);
                });
              }}
            >
              {labels.item}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeParentOpen} onOpenChange={setRemoveParentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.parent}?</AlertDialogTitle>
            <AlertDialogDescription>
              {buildParentRemovalDescription({
                parentTitle: item.parentTitle ?? item.title,
                preview: previewQuery.data,
                isLoading: previewQuery.isLoading,
                failed: previewQuery.isError,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeParentMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeParentMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void removeParentMutation.mutateAsync().then(() => {
                  setRemoveParentOpen(false);
                });
              }}
            >
              {labels.parent}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getRemovalLabels(item: Pick<WatchlistItem, "mediaType">) {
  if (item.mediaType === "episode") {
    return {
      item: "Remove episode",
      parent: "Remove show",
    };
  }

  if (item.mediaType === "comic") {
    return {
      item: "Remove issue",
      parent: "Remove volume",
    };
  }

  return {
    item: "Remove item",
    parent: "Remove group",
  };
}

function buildParentRemovalDescription({
  parentTitle,
  preview,
  isLoading,
  failed,
}: {
  parentTitle: string;
  preview?: { count: number; watchedCount: number };
  isLoading: boolean;
  failed: boolean;
}) {
  if (isLoading) {
    return `Checking how many items from ${parentTitle} will be removed...`;
  }

  if (failed || !preview) {
    return `This will remove ${parentTitle} from this watchlist. The affected item count is unavailable.`;
  }

  return `This will remove ${preview.count} items from ${parentTitle}, including ${preview.watchedCount} watched.`;
}
