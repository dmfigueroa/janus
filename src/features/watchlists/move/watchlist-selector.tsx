import { useState, type ReactNode } from "react";
import type { WatchlistSummary } from "@/features/watchlists/list/query.server";
import { Input } from "@/components/ui/input";

type WatchlistSelectorProps = {
  watchlists: WatchlistSummary[];
  selectedId: number | null;
  isLoading: boolean;
  isError: boolean;
  onSelect: (id: number) => void;
};

export function WatchlistSelector({
  watchlists,
  selectedId,
  isLoading,
  isError,
  onSelect,
}: WatchlistSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedQuery = searchQuery.toLowerCase();

  const filteredWatchlists = searchQuery
    ? watchlists.filter((wl) => wl.name.toLowerCase().includes(normalizedQuery))
    : watchlists;

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
        <>
          <Input
            placeholder="Search watchlists..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            className="mb-2"
          />
          {filteredWatchlists.length === 0 ? (
            <ListStateMessage>No matching watchlists</ListStateMessage>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-md border">
              <div className="p-1">
                {filteredWatchlists.map((wl) => (
                  <WatchlistOption
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
        </>
      )}
    </div>
  );
}

type ListStateMessageProps = {
  children: ReactNode;
  variant?: "default" | "error";
};

function ListStateMessage({ children, variant = "default" }: ListStateMessageProps) {
  return (
    <div
      className={`flex h-32 items-center justify-center text-sm ${variant === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </div>
  );
}

type WatchlistOptionProps = {
  selected: boolean;
  onClick: () => void;
  name: string;
  itemCount: number;
};

function WatchlistOption({ selected, onClick, name, itemCount }: WatchlistOptionProps) {
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
