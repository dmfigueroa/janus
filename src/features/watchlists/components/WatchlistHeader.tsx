import type { Watchlist } from "@/db/Schema";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";
import { calculateWatchlistProgress } from "@/features/watchlists/Progress";
import { ToggleButton } from "@/ui/ToggleButton";
import { Pencil, Search } from "lucide-react";

interface WatchlistHeaderProps {
  watchlist: Watchlist;
  totalItems: number;
  watchedItems: number;
  showUnwatchedOnly: boolean;
  onFilterChange: (showUnwatchedOnly: boolean) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  interactionDisabled?: boolean;
}

/**
 * High-level orchestrator for the Watchlist page header.
 * Follows the Stepdown Rule: High-level layout here, implementation details below.
 */
export function WatchlistHeader({
  watchlist,
  totalItems,
  watchedItems,
  showUnwatchedOnly,
  onFilterChange,
  searchQuery,
  onSearchChange,
  interactionDisabled = false,
}: WatchlistHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-background/95 pb-4 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:pb-6">
      <WatchlistTitle watchlist={watchlist} />

      <div className="space-y-4">
        <WatchlistProgress totalItems={totalItems} watchedItems={watchedItems} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <WatchlistSearch
            query={searchQuery}
            onChange={onSearchChange}
            disabled={interactionDisabled}
          />

          <div className="flex flex-col gap-2 self-start sm:self-auto sm:items-end">
            <WatchlistFilterToggle
              showUnwatchedOnly={showUnwatchedOnly}
              onChange={onFilterChange}
              disabled={interactionDisabled}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function WatchlistTitle({ watchlist }: { watchlist: Watchlist }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{watchlist.name}</h1>
        <WatchlistFormDialog
          mode="edit"
          watchlist={watchlist}
          trigger={
            <button
              type="button"
              aria-label="Edit watchlist"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
          }
        />
      </div>
      {watchlist.description && (
        <p className="text-sm text-muted-foreground hidden md:block">{watchlist.description}</p>
      )}
    </div>
  );
}

function WatchlistProgress({
  totalItems,
  watchedItems,
}: {
  totalItems: number;
  watchedItems: number;
}) {
  const percentage = calculateWatchlistProgress({ totalItems, watchedItems });

  return (
    <div className="space-y-2">
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
    </div>
  );
}

function WatchlistSearch({
  query,
  onChange,
  disabled = false,
}: {
  query: string;
  onChange: (query: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search titles..."
        disabled={disabled}
        className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function WatchlistFilterToggle({
  showUnwatchedOnly,
  onChange,
  disabled = false,
}: {
  showUnwatchedOnly: boolean;
  onChange: (showUnwatchedOnly: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-1">
      <ToggleButton active={!showUnwatchedOnly} onClick={() => onChange(false)} disabled={disabled}>
        All
      </ToggleButton>
      <ToggleButton active={showUnwatchedOnly} onClick={() => onChange(true)} disabled={disabled}>
        Unwatched
      </ToggleButton>
    </div>
  );
}
