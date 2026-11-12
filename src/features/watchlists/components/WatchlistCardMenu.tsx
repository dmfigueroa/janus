import { IconButton, Menu, Portal } from "@chakra-ui/react";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { useState } from "react";
import { toaster } from "@/app/Toaster";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { DeleteWatchlistDialog } from "@/features/watchlists/components/DeleteWatchlistDialog";
import {
  useDeleteWatchlist,
  useSkipWatchlist,
  useToggleWatchlistPause,
} from "@/features/watchlists/lifecycle/useWatchlistLifecycleActions";

type WatchlistCardMenuProps = {
  watchlist: WatchlistSummary;
};

export function WatchlistCardMenu({ watchlist }: WatchlistCardMenuProps) {
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const togglePause = useToggleWatchlistPause(watchlist);
  const skip = useSkipWatchlist(watchlist.id);
  const remove = useDeleteWatchlist(watchlist.id);

  const handleDelete = async () => {
    try {
      await remove.mutateAsync();
    } catch {
      return;
    }
    setDeleteOpen(false);
    toaster.create({ type: "success", title: "Watchlist deleted" });
  };

  const handleSkip = async () => {
    try {
      await skip.mutateAsync();
    } catch {
      return;
    }
  };

  const handleTogglePause = async () => {
    try {
      await togglePause.mutateAsync();
    } catch {
      return;
    }
    showPauseFeedback(Boolean(watchlist.pausedAt));
  };

  return (
    <>
      <WatchlistActionMenu
        watchlistName={watchlist.name}
        hasNextUnwatched={Boolean(watchlist.stats.nextUnwatched)}
        isPaused={watchlist.pausedAt !== null}
        skipping={skip.isPending}
        pausePending={togglePause.isPending}
        onSkip={() => void handleSkip()}
        onTogglePause={() => void handleTogglePause()}
        onDelete={() => setDeleteOpen(true)}
      />
      <DeleteWatchlistDialog
        watchlist={watchlist}
        open={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        deleting={remove.isPending}
        handleDelete={() => void handleDelete()}
      />
    </>
  );
}

type WatchlistActionMenuProps = {
  watchlistName: string;
  hasNextUnwatched: boolean;
  isPaused: boolean;
  skipping: boolean;
  pausePending: boolean;
  onSkip: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
};

function WatchlistActionMenu({
  watchlistName,
  hasNextUnwatched,
  isPaused,
  skipping,
  pausePending,
  onSkip,
  onTogglePause,
  onDelete,
}: WatchlistActionMenuProps) {
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
          minW="44px"
          minH="44px"
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
                Move to back of rotation
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
              {isPaused ? "Resume watchlist" : "Pause watchlist"}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
              value="delete"
              color="fg.error"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 size={16} /> Delete watchlist
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

function showPauseFeedback(wasPaused: boolean) {
  const title = wasPaused ? "Watchlist returned to rotation" : "Watchlist paused";
  const description = wasPaused ? undefined : "Removed from active rotation. Find it under Paused.";
  toaster.create({ type: "success", title, description });
}
