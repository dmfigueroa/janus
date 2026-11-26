import { Center, Field, Input, Stack, Text } from "@chakra-ui/react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { WatchlistOption, type WatchlistOptionProps } from "./WatchlistOption";

function filterWatchlists(watchlists: WatchlistSummary[], query: string) {
  if (!query) return watchlists;
  const normalized = query.toLowerCase();
  return watchlists.filter((watchlist) => watchlist.name.toLowerCase().includes(normalized));
}

function suppressEnterSubmit(event: KeyboardEvent) {
  if (event.key === "Enter") event.preventDefault();
}

function WatchlistSelectorState({
  isLoading,
  isError,
  isEmpty,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  children: ReactNode;
}) {
  if (isLoading) return <ListStateMessage>Loading watchlists...</ListStateMessage>;
  return (
    <LoadedWatchlistSelectorState isError={isError} isEmpty={isEmpty}>
      {children}
    </LoadedWatchlistSelectorState>
  );
}

function LoadedWatchlistSelectorState({
  isError,
  isEmpty,
  children,
}: Pick<Parameters<typeof WatchlistSelectorState>[0], "isError" | "isEmpty" | "children">) {
  if (isError)
    return <ListStateMessage variant="error">Failed to load watchlists</ListStateMessage>;
  if (isEmpty) return <ListStateMessage>No other watchlists available</ListStateMessage>;
  return <>{children}</>;
}

type WatchlistSelectorProps = {
  watchlists: WatchlistSummary[];
  selectedId: number | null;
  isLoading: boolean;
  isError: boolean;
  disabled?: boolean;
  onSelect: (id: number) => void;
};

export function WatchlistSelector({
  watchlists,
  selectedId,
  isLoading,
  isError,
  disabled = false,
  onSelect,
}: WatchlistSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredWatchlists = filterWatchlists(watchlists, searchQuery);

  return (
    <Field.Root>
      <Field.Label>Select destination</Field.Label>
      <WatchlistSelectorState
        isLoading={isLoading}
        isError={isError}
        isEmpty={watchlists.length === 0}
      >
        <Stack gap={2}>
          <Input
            aria-label="Search destination watchlists"
            placeholder="Search watchlists..."
            value={searchQuery}
            disabled={disabled}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={suppressEnterSubmit}
          />
          <WatchlistOptions
            watchlists={filteredWatchlists}
            selectedId={selectedId}
            disabled={disabled}
            onSelect={onSelect}
          />
        </Stack>
      </WatchlistSelectorState>
    </Field.Root>
  );
}

function WatchlistOptions({
  watchlists,
  selectedId,
  disabled,
  onSelect,
}: {
  watchlists: WatchlistSummary[];
  selectedId: number | null;
  disabled: boolean;
  onSelect: (id: number) => void;
}) {
  if (watchlists.length === 0) {
    return <ListStateMessage>No matching watchlists</ListStateMessage>;
  }

  return (
    <Stack
      gap={1}
      maxH="12rem"
      overflowY="auto"
      rounded="md"
      borderWidth="1px"
      borderColor="border.default"
      p={1}
    >
      <WatchlistOptionList
        watchlists={watchlists}
        selectedId={selectedId}
        disabled={disabled}
        onSelect={onSelect}
      />
    </Stack>
  );
}

function WatchlistOptionList({
  watchlists,
  selectedId,
  disabled,
  onSelect,
}: {
  watchlists: WatchlistSummary[];
  selectedId: number | null;
  disabled: boolean;
  onSelect: (id: number) => void;
}) {
  const optionProps: WatchlistOptionProps[] = watchlists.map((watchlist) => ({
    optionKey: watchlist.id,
    watchlist,
    selected: selectedId === watchlist.id,
    disabled,
    onSelect,
  }));

  return optionProps.map(WatchlistOption);
}

type ListStateMessageProps = {
  children: ReactNode;
  variant?: "default" | "error";
};

function ListStateMessage({ children, variant = "default" }: ListStateMessageProps) {
  return (
    <Center minH="8rem">
      <Text fontSize="sm" color={variant === "error" ? "status.error" : "fg.muted"}>
        {children}
      </Text>
    </Center>
  );
}
