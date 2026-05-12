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
  itemOrderMode,
  onItemOrderModeChange,
  isUpdatingItemOrderMode,
  searchQuery,
  onSearchChange,
}: WatchlistHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-background/95 pb-4 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:pb-6">
      <WatchlistTitle name={watchlist.name} description={watchlist.description} />

      <div className="space-y-4">
        <WatchlistProgress totalItems={totalItems} watchedItems={watchedItems} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <WatchlistSearch query={searchQuery} onChange={onSearchChange} />

          <div className="flex flex-col gap-2 self-start sm:self-auto sm:items-end">
            <WatchlistOrderToggle
              mode={itemOrderMode}
              onChange={onItemOrderModeChange}
              isUpdating={isUpdatingItemOrderMode}
            />
            <WatchlistFilterToggle
              showUnwatchedOnly={showUnwatchedOnly}
              onChange={onFilterChange}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function WatchlistTitle({ name, description }: { name: string; description: string | null }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h1 className="text-xl font-bold tracking-tight md:text-2xl">{name}</h1>
      {description && (
        <p className="text-sm text-muted-foreground hidden md:block">{description}</p>
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
}: {
  query: string;
  onChange: (query: string) => void;
}) {
  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search titles..."
        className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function WatchlistOrderToggle({
  mode,
  onChange,
  isUpdating,
}: {
  mode: WatchlistItemOrderMode;
  onChange: (mode: WatchlistItemOrderMode) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-1">
      <ToggleButton
        active={mode === "release"}
        onClick={() => onChange("release")}
        disabled={isUpdating}
      >
        Release
      </ToggleButton>
      <ToggleButton
        active={mode === "custom"}
        onClick={() => onChange("custom")}
        disabled={isUpdating}
      >
        Custom
      </ToggleButton>
    </div>
  );
}

function WatchlistFilterToggle({
  showUnwatchedOnly,
  onChange,
}: {
  showUnwatchedOnly: boolean;
  onChange: (showUnwatchedOnly: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-1">
      <ToggleButton active={!showUnwatchedOnly} onClick={() => onChange(false)}>
        All
      </ToggleButton>
      <ToggleButton active={showUnwatchedOnly} onClick={() => onChange(true)}>
        Unwatched
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-60",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
