import type { Watchlist } from "@/db/schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";
import { cn } from "@/utils/cn";
import { Search } from "lucide-react";

interface WatchlistHeaderProps {
  watchlist: Watchlist;
  totalItems: number;
  watchedItems: number;
  showUnwatchedOnly: boolean;
  onFilterChange: (showUnwatchedOnly: boolean) => void;
  itemOrderMode: WatchlistItemOrderMode;
  onItemOrderModeChange: (itemOrderMode: WatchlistItemOrderMode) => void;
  isUpdatingItemOrderMode: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function WatchlistHeader({
  watchlist,
  totalItems,
  watchedItems,
  showUnwatchedOnly,
  onFilterChange,
  itemOrderMode,
  onItemOrderModeChange,
  isUpdatingItemOrderMode,
  searchQuery,
  onSearchChange,
}: WatchlistHeaderProps) {
  const percentage = calculateWatchlistProgress({ totalItems, watchedItems });

  return (
    <div className="sticky top-0 z-40 bg-background/95 pb-4 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:pb-6">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{watchlist.name}</h1>
        {watchlist.description && (
          <p className="text-sm text-muted-foreground hidden md:block">{watchlist.description}</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-end justify-between text-sm font-medium">
          <span className="text-primary font-bold">
            {watchedItems}/{totalItems} Watched
          </span>
          <span className="text-muted-foreground">{percentage}% Complete</span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search titles..."
              className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2 self-start sm:self-auto sm:items-end">
            <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-1">
              <button
                onClick={() => onItemOrderModeChange("release")}
                disabled={isUpdatingItemOrderMode}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-60",
                  itemOrderMode === "release"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                Release
              </button>
              <button
                onClick={() => onItemOrderModeChange("custom")}
                disabled={isUpdatingItemOrderMode}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-60",
                  itemOrderMode === "custom"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                Custom
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-1">
              <button
                onClick={() => onFilterChange(false)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  !showUnwatchedOnly
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                All
              </button>
              <button
                onClick={() => onFilterChange(true)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  showUnwatchedOnly
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                Unwatched
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
