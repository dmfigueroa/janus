import type { Watchlist } from "@/db/Schema";
import { Flex, Heading, IconButton } from "@chakra-ui/react";
import { ExpandableWatchlistDescription } from "@/features/watchlists/components/ExpandableWatchlistDescription";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";
import { WatchlistPauseButton } from "@/features/watchlists/components/WatchlistPauseButton";
import { Pencil } from "lucide-react";

type WatchlistTitleProps = {
  watchlist: Watchlist;
  onTogglePause: () => void;
  interactionDisabled: boolean;
};

export function WatchlistTitle({
  watchlist,
  onTogglePause,
  interactionDisabled,
}: WatchlistTitleProps) {
  return (
    <Flex mb={2} direction="column" gap={2}>
      <Flex align="center" gap={2} minW={0}>
        <Heading as="h1" size={{ base: "xl", md: "2xl" }} letterSpacing="tight" truncate>
          {watchlist.name}
        </Heading>
        <WatchlistPauseButton
          isPaused={watchlist.pausedAt !== null}
          onTogglePause={onTogglePause}
          disabled={interactionDisabled}
        />
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
        <ExpandableWatchlistDescription
          key={watchlist.description}
          description={watchlist.description}
        />
      )}
    </Flex>
  );
}
