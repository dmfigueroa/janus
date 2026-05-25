import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Image } from "lucide-react";
import { useState } from "react";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistSummary } from "@/features/watchlists/list/query.server";
import { getWatchlistList } from "@/features/watchlists/list/query";
import { useMoveWatchlistItemMutation } from "./use-move-watchlist-item";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MoveItemDialog({ item, open, onOpenChange }: MoveItemDialogProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const watchlistListFn = useServerFn(getWatchlistList);
  const listQuery = useQuery<WatchlistSummary[], Error>({
    queryKey: ["watchlists", "list", {}],
    queryFn: () => watchlistListFn({ data: {} }),
    staleTime: Infinity,
  });

  const moveMutation = useMoveWatchlistItemMutation({
    item,
    activeFilters: { watchlistId: item.watchlistId, unwatchedOnly: false },
  });

  const otherWatchlists: WatchlistSummary[] = Array.isArray(listQuery.data)
    ? listQuery.data.filter((wl) => wl.id !== item.watchlistId)
    : [];

  const handleMove = async () => {
    if (selectedId === null) return;

    try {
      await moveMutation.mutateAsync(selectedId);
      onOpenChange(false);
    } catch {
      // Error toast handled by onError callback
    }
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
          <div className="flex items-center gap-3 rounded-lg border p-3">
            {item.posterPath ? (
              <img
                src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                alt=""
                className="h-12 w-8 rounded object-cover shrink-0"
              />
            ) : (
              <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted">
                <Image size={16} className="text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground capitalize">{item.mediaType}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Select destination</p>
            {listQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                Loading watchlists...
              </div>
            ) : listQuery.isError ? (
              <div className="flex h-32 items-center justify-center text-sm text-destructive">
                Failed to load watchlists
              </div>
            ) : otherWatchlists.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                No other watchlists available
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <div className="p-1">
                  {otherWatchlists.map((wl) => (
                    <button
                      key={wl.id}
                      type="button"
                      onClick={() => setSelectedId(wl.id)}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        selectedId === wl.id
                          ? "bg-secondary text-secondary-foreground"
                          : "hover:bg-secondary/50"
                      }`}
                    >
                      <div
                        className={`size-4 shrink-0 rounded border ${
                          selectedId === wl.id
                            ? "border-primary bg-primary"
                            : "border-muted-foreground"
                        }`}
                      >
                        {selectedId === wl.id && (
                          <svg viewBox="0 0 12 12" className="size-full text-primary-foreground">
                            <path
                              d="M2 6l3 3 5-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{wl.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {wl.stats.totalItems} item{wl.stats.totalItems !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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
