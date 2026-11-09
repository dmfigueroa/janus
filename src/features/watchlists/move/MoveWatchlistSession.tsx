import { useState } from "react";
import type { WatchlistItem } from "@/db/Schema";
import type { InsertionPosition } from "@/features/watchlists/Order";
import { useWatchlistListQuery } from "./useWatchlistListQuery";
import { MoveWatchlistDialogContent } from "./MoveWatchlistDialogContent";

export type MoveWatchlistDialogProps = {
  item: WatchlistItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  mutation: {
    isPending: boolean;
    mutate: (
      destination: { destinationWatchlistId: number; position?: InsertionPosition },
      callbacks: { onSuccess: () => void },
    ) => void;
  };
};

export function MoveWatchlistSession({
  item,
  open,
  onOpenChange,
  title,
  description,
  mutation,
}: MoveWatchlistDialogProps) {
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<InsertionPosition>("end");
  const listQuery = useWatchlistListQuery({ enabled: open });
  const watchlists = (listQuery.data ?? []).filter(
    (watchlist) => watchlist.id !== item.watchlistId,
  );
  const destination = watchlists.find((watchlist) => watchlist.id === selectedWatchlistId);
  const isCustomOrdered = destination?.itemOrderMode === "custom";
  const handleMove = () => {
    if (selectedWatchlistId === null) return;
    mutation.mutate(
      {
        destinationWatchlistId: selectedWatchlistId,
        position: isCustomOrdered ? selectedPosition : undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <MoveWatchlistDialogContent
      item={item}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      watchlists={watchlists}
      selectedWatchlistId={selectedWatchlistId}
      onSelectedWatchlistIdChange={setSelectedWatchlistId}
      selectedPosition={selectedPosition}
      onSelectedPositionChange={setSelectedPosition}
      isCustomOrdered={isCustomOrdered}
      isLoading={listQuery.isLoading}
      isError={listQuery.isError}
      isPending={mutation.isPending}
      onMove={handleMove}
    />
  );
}
