import { Info } from "lucide-react";

export function AutoOrderingNotice() {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 p-3 rounded-md">
      <Info className="size-4 shrink-0 mt-0.5" />
      <p>
        This watchlist is ordered by release date. The item will be inserted near similar release
        dates.
      </p>
    </div>
  );
}
