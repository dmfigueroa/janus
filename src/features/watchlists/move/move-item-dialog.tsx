import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
import type { WatchlistSummary } from "@/features/watchlists/list/query.server";
import { getWatchlistList } from "@/features/watchlists/list/query";
import { ItemPreview } from "@/features/watchlists/components/item-preview";
import { useMoveWatchlistItemMutation } from "./use-move-watchlist-item";
import { WatchlistSelector } from "./watchlist-selector";
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

type MoveItemDialogProps = {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MoveItemDialog({ item, activeFilters, open, onOpenChange }: MoveItemDialogProps) {
  const listQuery = useWatchlistListQuery({ enabled: open });
  const moveMutation = useMoveWatchlistItemMutation({ item, activeFilters });
  const { selectedId, setSelectedId } = useSelectedWatchlistId(open);

  const otherWatchlists = Array.isArray(listQuery.data)
    ? listQuery.data.filter((wl) => wl.id !== item.watchlistId)
    : [];

  const handleMove = () => {
    if (selectedId === null) return;
    moveMutation.mutate(selectedId, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[80vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>Move to another watchlist</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Select a watchlist to move this item to.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 min-h-0">
          <ItemPreview item={item} />
          <WatchlistSelector
            watchlists={otherWatchlists}
            selectedId={selectedId}
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            onSelect={setSelectedId}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={moveMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={selectedId === null || moveMutation.isPending || listQuery.isLoading}
            onClick={(e) => {
              e.preventDefault();
              void handleMove();
            }}
          >
            {moveMutation.isPending ? "Moving..." : "Move"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useWatchlistListQuery({ enabled }: { enabled: boolean }) {
  const watchlistListFn = useServerFn(getWatchlistList);
  return useQuery<WatchlistSummary[], Error>({
    queryKey: ["watchlists", "list", {}],
    queryFn: () => watchlistListFn({ data: {} }),
    staleTime: Infinity,
    enabled,
  });
}

function useSelectedWatchlistId(open: boolean) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (open) setSelectedId(null);
  }, [open]);

  return { selectedId, setSelectedId };
}
