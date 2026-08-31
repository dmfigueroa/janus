import type { Watchlist } from "@/db/Schema";
import { Box, Button, Flex, Heading, IconButton, Input, Text } from "@chakra-ui/react";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";
import { calculateWatchlistProgress } from "@/features/watchlists/Progress";
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
      <WatchlistTitle watchlist={watchlist} />

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

function WatchlistTitle({ watchlist }: { watchlist: Watchlist }) {
  return (
    <Flex mb={2} align="center" justify="space-between" gap={2}>
      <Flex align="center" gap={2} minW={0}>
        <Heading as="h1" size={{ base: "xl", md: "2xl" }} letterSpacing="tight" truncate>
          {watchlist.name}
        </Heading>
        <WatchlistFormDialog
          mode="edit"
          watchlist={watchlist}
          trigger={
            <IconButton
              type="button"
              aria-label="Edit watchlist"
              variant="ghost"
              size="sm"
              color="fg.muted"
            >
              <Pencil size={16} />
            </IconButton>
          }
        />
      </Flex>
      {watchlist.description && (
        <Text fontSize="sm" color="fg.muted" display={{ base: "none", md: "block" }}>
          {watchlist.description}
        </Text>
      )}
    </Flex>
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
