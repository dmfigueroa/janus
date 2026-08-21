import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";

interface MergeWatchlistOrderProps {
  watchlists: WatchlistSummary[];
  hasCustomOrderedSelection: boolean;
  isSubmitting: boolean;
  onMove: (watchlistId: number, direction: "up" | "down") => void;
}

export function MergeWatchlistOrder({
  watchlists,
  hasCustomOrderedSelection,
  isSubmitting,
  onMove,
}: MergeWatchlistOrderProps) {
  return (
    <Box rounded="lg" borderWidth="1px" borderColor="border.default" bg="bg.subtle" p={3}>
      <Stack gap={1}>
        <Text fontSize="sm" fontWeight="medium">
          Merge order
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {hasCustomOrderedSelection
            ? "This order sets the final custom ranking when any selected list uses custom order."
            : "This order is kept for the selected lists and release ordering still applies within each list."}
        </Text>
      </Stack>

      <Stack as="ol" gap={2} mt={3} listStyleType="none" m={0}>
        <MergeWatchlistOrderItems
          watchlists={watchlists}
          isSubmitting={isSubmitting}
          onMove={onMove}
        />
      </Stack>
    </Box>
  );
}

function MergeWatchlistOrderItems({
  watchlists,
  isSubmitting,
  onMove,
}: {
  watchlists: WatchlistSummary[];
  isSubmitting: boolean;
  onMove: MergeWatchlistOrderProps["onMove"];
}) {
  const itemProps = watchlists.map((watchlist, index) => ({
    key: watchlist.id,
    watchlist,
    index,
    watchlistCount: watchlists.length,
    isSubmitting,
    onMove,
  }));

  return itemProps.map(MergeWatchlistOrderItem);
}

function MergeWatchlistOrderItem({
  watchlist,
  index,
  watchlistCount,
  isSubmitting,
  onMove,
}: {
  watchlist: WatchlistSummary;
  index: number;
  watchlistCount: number;
  isSubmitting: boolean;
  onMove: MergeWatchlistOrderProps["onMove"];
}) {
  const orderModeLabel = getOrderModeLabel(watchlist.itemOrderMode);

  return (
    <Box
      as="li"
      key={watchlist.id}
      data-testid={`merge-order-item-${watchlist.id}`}
      rounded="md"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.surface"
      px={3}
      py={2}
    >
      <Flex align="center" justify="space-between" gap={3}>
        <Box minW={0}>
          <Text truncate fontSize="sm" fontWeight="medium">
            {watchlist.name}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            {orderModeLabel}
          </Text>
        </Box>

        <Flex gap={2}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onMove(watchlist.id, "up")}
            disabled={isMoveUpDisabled(isSubmitting, index)}
            aria-label={`Move ${watchlist.name} up`}
          >
            Up
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onMove(watchlist.id, "down")}
            disabled={isMoveDownDisabled(isSubmitting, index, watchlistCount)}
            aria-label={`Move ${watchlist.name} down`}
          >
            Down
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}

function getOrderModeLabel(itemOrderMode: WatchlistSummary["itemOrderMode"]) {
  return itemOrderMode === "custom" ? "Custom order" : "Release order";
}

function isMoveUpDisabled(isSubmitting: boolean, index: number) {
  return isSubmitting || index === 0;
}

function isMoveDownDisabled(isSubmitting: boolean, index: number, watchlistCount: number) {
  return isSubmitting || index === watchlistCount - 1;
}
