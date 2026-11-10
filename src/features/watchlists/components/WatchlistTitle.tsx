import type { Watchlist } from "@/db/Schema";
import { Badge, Flex, Heading } from "@chakra-ui/react";
import { ExpandableWatchlistDescription } from "@/features/watchlists/components/ExpandableWatchlistDescription";
import { WatchlistActions } from "./WatchlistActions";

type WatchlistTitleProps = {
  watchlist: Watchlist;
  onTogglePause: () => void;
  onDelete: () => void;
  interactionDisabled: boolean;
};

export function WatchlistTitle({
  watchlist,
  onTogglePause,
  onDelete,
  interactionDisabled,
}: WatchlistTitleProps) {
  return (
    <Flex mb={2} direction="column" gap={2}>
      <Flex align="center" gap={2} minW={0}>
        <Heading as="h1" size={{ base: "xl", md: "2xl" }} letterSpacing="tight" flex={1}>
          {watchlist.name}
        </Heading>
        {watchlist.pausedAt !== null && (
          <Badge
            variant="subtle"
            colorPalette="gray"
            flexShrink={0}
            px={2}
            py={1}
            rounded="md"
            role="status"
          >
            Paused
          </Badge>
        )}
        <WatchlistActions
          watchlist={watchlist}
          onTogglePause={onTogglePause}
          onDelete={onDelete}
          interactionDisabled={interactionDisabled}
        />
      </Flex>
      {watchlist.description && (
        <ExpandableWatchlistDescription
          key={watchlist.description}
          description={watchlist.description}
        />
      )}
    </Flex>
  );
}
