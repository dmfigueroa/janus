import { IconButton, Menu, Portal } from "@chakra-ui/react";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toaster } from "@/app/Toaster";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { deleteWatchlist } from "@/features/watchlists/delete/Mutation";
import { skipWatchlist } from "@/features/watchlists/skip/Mutation";
import { pauseWatchlist, resumeWatchlist } from "@/features/watchlists/pause/PauseWatchlist";
import { DeleteWatchlistDialog } from "@/features/watchlists/components/DeleteWatchlistDialog";

type WatchlistCardMenuProps = {
  watchlist: WatchlistSummary;
};

export function WatchlistCardMenu({ watchlist }: WatchlistCardMenuProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [pausePending, setPausePending] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const deleteWatchlistFn = useServerFn(deleteWatchlist);
  const skipWatchlistFn = useServerFn(skipWatchlist);
  const pauseWatchlistFn = useServerFn(pauseWatchlist);
  const resumeWatchlistFn = useServerFn(resumeWatchlist);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteWatchlistFn({ data: { id: watchlist.id } });
      ensureSuccessfulResult(result);
    } catch (error) {
      console.error("Failed to delete", error);
      toaster.create({ type: "error", title: "Failed to delete watchlist. Please try again." });
      return;
    } finally {
      setDeleting(false);
    }
    setDeleteOpen(false);
    toaster.create({ type: "success", title: "Watchlist deleted" });
    await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    await router.invalidate?.();
  };

  const handleSkip = async () => {
    setSkipping(true);
    try {
      const result = await skipWatchlistFn({ data: { watchlistId: watchlist.id } });
      ensureSuccessfulResult(result);
      await router.invalidate?.();
    } catch (error) {
      console.error("Failed to skip watchlist", error);
      toaster.create({ type: "error", title: "Failed to skip watchlist. Please try again." });
    } finally {
      setSkipping(false);
    }
  };

  const requestPauseToggle = () => {
    if (watchlist.pausedAt) {
      return resumeWatchlistFn({ data: { watchlistId: watchlist.id } });
    }
    return pauseWatchlistFn({ data: { watchlistId: watchlist.id } });
  };

  const handleTogglePause = async () => {
    setPausePending(true);
    try {
      const result = await requestPauseToggle();
      ensureSuccessfulResult(result);
      await router.invalidate?.();
    } catch (error) {
      console.error("Failed to change watchlist pause state", error);
      toaster.create({
        type: "error",
        title: "Failed to change the pause state. Please try again.",
      });
    } finally {
      setPausePending(false);
    }
  };

  return (
    <>
      <WatchlistActionMenu
        watchlistName={watchlist.name}
        hasNextUnwatched={Boolean(watchlist.stats.nextUnwatched)}
        isPaused={watchlist.pausedAt !== null}
        skipping={skipping}
        pausePending={pausePending}
        onSkip={() => void handleSkip()}
        onTogglePause={() => void handleTogglePause()}
        onDelete={() => setDeleteOpen(true)}
      />
      <DeleteWatchlistDialog
        watchlist={watchlist}
        open={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        deleting={deleting}
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
              <Trash2 size={16} /> Delete
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

function ensureSuccessfulResult(result: { success: boolean }) {
  if (!result.success) throw new Error("The watchlist action failed");
}
