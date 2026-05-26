import { useState } from "react";
import { useEffect } from "react";
import type { InsertionPosition } from "@/features/watchlists/order-insert.server";

export function useMoveDialogState(open: boolean) {
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<InsertionPosition>("end");

  useEffect(() => {
    if (open) {
      setSelectedWatchlistId(null);
      setSelectedPosition("end");
    }
  }, [open]);

  return {
    selectedWatchlistId,
    setSelectedWatchlistId,
    selectedPosition,
    setSelectedPosition,
  };
}
