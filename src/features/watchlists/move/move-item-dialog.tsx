import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import type { WatchlistItem } from "@/db/schema";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
import type { WatchlistSummary } from "@/features/watchlists/list/query.server";
import type { InsertionPosition } from "@/features/watchlists/order-insert.server";
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
  const { selectedPosition, setSelectedPosition } = useSelectedPosition(open);

  const otherWatchlists = Array.isArray(listQuery.data)
    ? listQuery.data.filter((wl) => wl.id !== item.watchlistId)
    : [];

  const selectedWatchlist = otherWatchlists.find((wl) => wl.id === selectedId);
  const isCustomOrdered = selectedWatchlist?.itemOrderMode === "custom";

  const handleMove = () => {
    if (selectedId === null) return;
    moveMutation.mutate(
      {
        destinationWatchlistId: selectedId,
        position: isCustomOrdered ? selectedPosition : undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
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
          {selectedId !== null && isCustomOrdered && (
            <div className="space-y-3 rounded-md border bg-secondary/20 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Insert position</p>
                <p className="text-xs text-muted-foreground">
                  Choose where this item should land in the watchlist&apos;s manual sequence.
                </p>
              </div>
              <RadioGroup
                value={selectedPosition}
                onValueChange={(value) => setSelectedPosition(value as InsertionPosition)}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="move-insert-beginning" value="beginning" />
                  <Label htmlFor="move-insert-beginning">Beginning</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="move-insert-end" value="end" />
                  <Label htmlFor="move-insert-end">End</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="move-insert-release-adjacent" value="release-adjacent" />
                  <Label htmlFor="move-insert-release-adjacent">Release-adjacent</Label>
                </div>
              </RadioGroup>
            </div>
          )}
          {selectedId !== null && !isCustomOrdered && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 p-3 rounded-md">
              <Info className="size-4 shrink-0 mt-0.5" />
              <p>
                This watchlist is ordered by release date. The item will be inserted near similar
                release dates.
              </p>
            </div>
          )}
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

function useSelectedPosition(open: boolean) {
  const [selectedPosition, setSelectedPosition] = useState<InsertionPosition>("end");

  useEffect(() => {
    if (open) setSelectedPosition("end");
  }, [open]);

  return { selectedPosition, setSelectedPosition };
}
