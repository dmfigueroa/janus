import type { Watchlist } from "@/db/Schema";
import { Flex, Heading, IconButton, Popover, Portal, Stack } from "@chakra-ui/react";
import { ExpandableWatchlistDescription } from "@/features/watchlists/components/ExpandableWatchlistDescription";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";
import { WatchlistPauseButton } from "@/features/watchlists/components/WatchlistPauseButton";
import { Pencil, Trash2, MoreHorizontal } from "lucide-react";

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
        <Popover.Root>
          <Popover.Trigger asChild>
            <IconButton aria-label="Watchlist actions" variant="ghost" minW="44px" h="44px">
              <MoreHorizontal size={20} />
            </IconButton>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content w="auto">
                <Popover.Body>
                  <Stack>
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
                    <IconButton
                      type="button"
                      aria-label="Delete watchlist"
                      variant="ghost"
                      size="sm"
                      color="fg.muted"
                      disabled={interactionDisabled}
                      onClick={onDelete}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </Stack>
                </Popover.Body>
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
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
