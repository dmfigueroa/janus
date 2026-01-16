"use client";

import { Watchlist } from "@/server/watchlist";
import { cn } from "@/utils/cn";

interface WatchlistHeaderProps {
  watchlist: Watchlist;
  totalItems: number;
  watchedItems: number;
  showUnwatchedOnly: boolean;
  onToggleFilter: () => void;
}

export function WatchlistHeader({
  watchlist,
  totalItems,
  watchedItems,
  showUnwatchedOnly,
  onToggleFilter,
}: WatchlistHeaderProps) {
  const percentage = totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0;

  return (
    <div className="sticky top-16 z-10 bg-background/95 pb-6 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold tracking-tight">{watchlist.name}</h1>
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

        {/* Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 border rounded-lg p-1 w-fit bg-secondary/30">
          <button
            onClick={onToggleFilter}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              !showUnwatchedOnly
                ? "bg-primary text-primary-foreground shadow-sm"
                : "hover:bg-accent text-muted-foreground",
            )}
          >
            All
          </button>
          <button
            onClick={onToggleFilter}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              showUnwatchedOnly
                ? "bg-primary text-primary-foreground shadow-sm"
                : "hover:bg-accent text-muted-foreground",
            )}
          >
            Unwatched
          </button>
        </div>
      </div>

      {/* Filtering/Sort controls could go here */}
    </div>
  );
}
