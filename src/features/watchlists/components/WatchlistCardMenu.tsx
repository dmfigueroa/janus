import { IconButton, Menu, Portal } from "@chakra-ui/react";
import { EllipsisVertical } from "lucide-react";

type WatchlistCardMenuProps = {
  watchlistName: string;
  hasNextUnwatched: boolean;
  isPaused: boolean;
  skipping: boolean;
  pausePending: boolean;
  onSkip: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
};

export function WatchlistCardMenu({
  watchlistName,
  hasNextUnwatched,
  isPaused,
  skipping,
  pausePending,
  onSkip,
  onTogglePause,
  onDelete,
}: WatchlistCardMenuProps) {
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton
          type="button"
          aria-label={`Watchlist actions for ${watchlistName}`}
          position="absolute"
          top={2}
          right={2}
          zIndex={10}
          size="sm"
          minW="8"
          p={0}
          rounded="full"
          variant="solid"
          bg="blackAlpha.600"
          color="white"
          shadow="lg"
          opacity={{ base: 1, md: 0 }}
          _groupHover={{ opacity: 1 }}
          _focusVisible={{ opacity: 1 }}
          _hover={{ bg: "blackAlpha.800" }}
        >
          <EllipsisVertical size={16} />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content onClick={(event) => event.stopPropagation()}>
            {hasNextUnwatched ? (
              <Menu.Item
                value="skip"
                disabled={skipping}
                onClick={(event) => {
                  event.stopPropagation();
                  onSkip();
                }}
              >
                Skip
              </Menu.Item>
            ) : null}
            <Menu.Item
              value="pause"
              disabled={pausePending}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePause();
              }}
            >
              {isPaused ? "Resume" : "Pause"}
            </Menu.Item>
            <Menu.Item
              value="delete"
              color="fg.error"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              Delete
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
