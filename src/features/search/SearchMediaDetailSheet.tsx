import { useEffect, useState } from "react";
import type { UnifiedMedia } from "@/server/Media";
import { Sheet, SheetContent } from "@/components/ui/Sheet";
import {
  addToWatchlist,
  type AddToWatchlistInsertionPosition,
} from "@/features/watchlists/add/Mutation";
import { getWatchlistList, watchlistListQueryKey } from "@/features/watchlists/list/Query";
import { toast } from "sonner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SearchMediaSummary, SearchMediaWatchlistControls } from "./SearchMediaDetailContent";

interface SearchMediaDetailSheetProps {
  media: UnifiedMedia | null;
  isOpen: boolean;
  onClose: () => void;
}

const watchlistSelectorFilters = { orderBy: "lastAdded" } as const;

function requiresCustomInsertion(
  watchlists: Awaited<ReturnType<typeof getWatchlistList>> | undefined,
  selectedWatchlistId: string,
) {
  if (!watchlists) return false;
  return (
    watchlists.find((watchlist) => watchlist.id.toString() === selectedWatchlistId)
      ?.itemOrderMode === "custom"
  );
}

function getInsertionPosition(
  required: boolean,
  insertionPosition: AddToWatchlistInsertionPosition | "",
) {
  if (!required) return undefined;
  return insertionPosition || undefined;
}

function getAddFailureMessage(data: { message?: string } | undefined) {
  return data?.message || "Failed to add to watchlist";
}

function validateSelectedWatchlist(selectedWatchlistId: string) {
  if (selectedWatchlistId) return true;
  toast.error("Please select a watchlist");
  return false;
}

function validateInsertionPosition(
  required: boolean,
  insertionPosition: AddToWatchlistInsertionPosition | "",
) {
  if (required && !insertionPosition) {
    toast.error("Choose where to insert this item in the custom order.");
    return false;
  }
  return true;
}

export function SearchMediaDetailSheet({ media, isOpen, onClose }: SearchMediaDetailSheetProps) {
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>("");
  const [insertionPosition, setInsertionPosition] = useState<AddToWatchlistInsertionPosition | "">(
    "",
  );
  const getWatchlistListFn = useServerFn(getWatchlistList);
  const addToWatchlistFn = useServerFn(addToWatchlist);

  const { data: watchlists } = useQuery({
    queryKey: watchlistListQueryKey(watchlistSelectorFilters),
    queryFn: () => getWatchlistListFn({ data: watchlistSelectorFilters }),
    enabled: isOpen,
  });

  const requiresInsertionChoice = requiresCustomInsertion(watchlists, selectedWatchlistId);

  useEffect(() => {
    setInsertionPosition("");
  }, [selectedWatchlistId]);

  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!media || !selectedWatchlistId) return;
      return addToWatchlistFn({
        data: {
          watchlistId: Number.parseInt(selectedWatchlistId, 10),
          media,
          insertionPosition: getInsertionPosition(requiresInsertionChoice, insertionPosition),
        },
      });
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(data.message);
        onClose();
      } else {
        toast.error(getAddFailureMessage(data));
      }
    },
    onError: (error) => {
      toast.error("An error occurred");
      console.error(error);
    },
  });

  if (!media) return null;

  const handleAddToWatchlist = () => {
    if (!validateSelectedWatchlist(selectedWatchlistId)) return;
    if (!validateInsertionPosition(requiresInsertionChoice, insertionPosition)) return;

    addToWatchlistMutation.mutate();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md md:max-w-lg lg:max-w-xl overflow-y-auto no-scrollbar">
        <SearchMediaSummary media={media} />
        <SearchMediaWatchlistControls
          mediaType={media.mediaType}
          watchlists={watchlists}
          selectedWatchlistId={selectedWatchlistId}
          insertionPosition={insertionPosition}
          requiresInsertionChoice={requiresInsertionChoice}
          isAdding={addToWatchlistMutation.isPending}
          onWatchlistSelect={setSelectedWatchlistId}
          onInsertionPositionChange={setInsertionPosition}
          onAdd={handleAddToWatchlist}
        />
      </SheetContent>
    </Sheet>
  );
}
