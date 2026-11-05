import type { Watchlist } from "@/db/Schema";
import { Box, Button, Flex, Input, Text } from "@chakra-ui/react";
import { WatchlistTitle } from "@/features/watchlists/components/WatchlistTitle";
import { calculateWatchlistProgress } from "@/features/watchlists/Progress";
import { Search } from "lucide-react";

interface WatchlistHeaderProps {
  watchlist: Watchlist;
  totalItems: number;
  watchedItems: number;
  showUnwatchedOnly: boolean;
  onFilterChange: (showUnwatchedOnly: boolean) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onTogglePause: () => void;
  onDelete: () => void;
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
  onTogglePause,
  onDelete,
  interactionDisabled = false,
}: WatchlistHeaderProps) {
  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={40}
      bg="bg.canvas/95"
      backdropFilter="blur(8px)"
      pb={{ base: 4, md: 6 }}
      pt={4}
    >
      <WatchlistTitle
        watchlist={watchlist}
        onTogglePause={onTogglePause}
        onDelete={onDelete}
        interactionDisabled={interactionDisabled}
      />

      <Box mt={4}>
        <WatchlistProgress totalItems={totalItems} watchedItems={watchedItems} />

        <Flex
          direction={{ base: "column", sm: "row" }}
          align={{ sm: "center" }}
          justify="space-between"
          gap={3}
        >
          <WatchlistSearch
            query={searchQuery}
            onChange={onSearchChange}
            disabled={interactionDisabled}
          />

          <WatchlistFilterToggle
            showUnwatchedOnly={showUnwatchedOnly}
            onChange={onFilterChange}
            disabled={interactionDisabled}
          />
        </Flex>
      </Box>
    </Box>
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
    <Box>
      <Flex align="end" justify="space-between" fontSize="sm" fontWeight="medium">
        <Text color="accent.solid" fontWeight="bold">
          {watchedItems}/{totalItems} Watched
        </Text>
        <Text color="fg.muted">{percentage}% Complete</Text>
      </Flex>

      <Box h={2} mt={2} bg="bg.subtle" rounded="full" overflow="hidden">
        <Box
          h="full"
          w={`${percentage}%`}
          bg="accent.solid"
          rounded="full"
          transition="width 500ms ease-out"
        />
      </Box>
    </Box>
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
    <Box position="relative" flex="1" maxW="sm">
      <Search
        size={16}
        style={{ position: "absolute", left: 10, top: 10 }}
        color="var(--chakra-colors-fg-muted)"
      />
      <Input
        type="search"
        placeholder="Search titles..."
        disabled={disabled}
        h={9}
        pl={9}
        value={query}
        onChange={(event) => onChange(event.target.value)}
      />
    </Box>
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
    <Flex
      align="center"
      gap={1}
      rounded="lg"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.subtle/30"
      p={1}
    >
      <FilterButton active={!showUnwatchedOnly} onClick={() => onChange(false)} disabled={disabled}>
        All
      </FilterButton>
      <FilterButton active={showUnwatchedOnly} onClick={() => onChange(true)} disabled={disabled}>
        Unwatched
      </FilterButton>
    </Flex>
  );
}

function FilterButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  children: string;
}) {
  return (
    <Button
      size="xs"
      variant={active ? "solid" : "ghost"}
      colorPalette="pink"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}
