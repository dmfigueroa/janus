import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Image } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { WatchlistItem } from "@/db/schema";
import { buildMediaPosterUrl } from "@/utils/tmdb";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
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
  activeFilters: WatchlistDetailQueryFilters;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MoveItemDialog({ item, activeFilters, open, onOpenChange }: MoveItemDialogProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
    }
  }, [open]);

  const watchlistListFn = useServerFn(getWatchlistList);
  const listQuery = useQuery<WatchlistSummary[], Error>({
    queryKey: ["watchlists", "list", {}],
    queryFn: () => watchlistListFn({ data: {} }),
    staleTime: Infinity,
    enabled: open,
  });

  const moveMutation = useMoveWatchlistItemMutation({
    item,
    activeFilters,
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

function ItemPreview({ item }: { item: WatchlistItem }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      {item.posterPath ? (
        <img
          src={buildMediaPosterUrl(item.posterPath, "w92")}
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
  );
}

function WatchlistSelector({
  watchlists,
  selectedId,
  isLoading,
  isError,
  onSelect,
}: {
  watchlists: WatchlistSummary[];
  selectedId: number | null;
  isLoading: boolean;
  isError: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Select destination</p>
      {isLoading ? (
        <ListStateMessage>Loading watchlists...</ListStateMessage>
      ) : isError ? (
        <ListStateMessage variant="error">Failed to load watchlists</ListStateMessage>
      ) : watchlists.length === 0 ? (
        <ListStateMessage>No other watchlists available</ListStateMessage>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-md border">
          <div className="p-1">
            {watchlists.map((wl) => (
              <SelectedOption
                key={wl.id}
                selected={selectedId === wl.id}
                onClick={() => onSelect(wl.id)}
                name={wl.name}
                itemCount={wl.stats.totalItems}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListStateMessage({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "error";
}) {
  return (
    <div
      className={`flex h-32 items-center justify-center text-sm ${variant === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </div>
  );
}

function SelectedOption({
  selected,
  onClick,
  name,
  itemCount,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  itemCount: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${selected ? "bg-secondary text-secondary-foreground" : "hover:bg-secondary/50"}`}
    >
      <div
        className={`size-4 shrink-0 rounded border ${selected ? "border-primary bg-primary" : "border-muted-foreground"}`}
      >
        {selected && (
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
        <p className="truncate font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          {itemCount} item{itemCount !== 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}
