import { Link as ChakraLink, Flex } from "@chakra-ui/react";
import { useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { deleteWatchlist } from "@/features/watchlists/delete/Mutation";
import { skipWatchlist } from "@/features/watchlists/skip/Mutation";
import { pauseWatchlist, resumeWatchlist } from "@/features/watchlists/pause/Mutation";
import { useState } from "react";
import { toaster } from "@/app/Toaster";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import {
  WatchlistCardInfo,
  type WatchlistCardInfoVariant,
} from "@/features/watchlists/components/WatchlistCardInfo";
import { WatchlistCardArtwork } from "@/features/watchlists/components/WatchlistCardArtwork";
import { WatchlistCardMenu } from "@/features/watchlists/components/WatchlistCardMenu";
import { DeleteWatchlistDialog } from "@/features/watchlists/components/DeleteWatchlistDialog";

export type EnrichedWatchlist = WatchlistSummary;

interface WatchlistCardProps {
  watchlist: EnrichedWatchlist;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  showUpNextBadge?: boolean;
  infoVariant?: WatchlistCardInfoVariant;
}

function withDefault<T>(value: T | undefined, fallback: T) {
  if (value === undefined) return fallback;
  return value;
}

function ensureSuccessfulResult(result: { success: boolean }) {
  if (!result.success) throw new Error("The watchlist action failed");
}

function CardArtworkLink({
  selectionMode,
  watchlistId,
  children,
}: {
  selectionMode: boolean;
  watchlistId: number;
  children: React.ReactNode;
}) {
  if (selectionMode) return children;
  return (
    <ChakraLink
      asChild
      display="block"
      h="full"
      cursor="pointer"
      transition="transform 300ms"
      _active={{ transform: "scale(0.95)" }}
    >
      <Link
        to="/watchlists/$watchlistId"
        params={{ watchlistId: watchlistId.toString() }}
        preload="viewport"
      >
        {children}
      </Link>
    </ChakraLink>
  );
}

export function WatchlistCard(cardProps: WatchlistCardProps) {
  const { watchlist, selectionMode, isSelected, onToggle, showUpNextBadge, infoVariant } = {
    ...cardProps,
    selectionMode: withDefault(cardProps.selectionMode, false),
    isSelected: withDefault(cardProps.isSelected, false),
    showUpNextBadge: withDefault(cardProps.showUpNextBadge, true),
    infoVariant: withDefault(cardProps.infoVariant, "watchlist"),
  };
  const router = useRouter();
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
      await deleteWatchlistFn({ data: { id: watchlist.id } });
      await router.invalidate?.();
      toaster.create({ type: "success", title: "Watchlist deleted successfully" });
    } catch (error) {
      console.error("Failed to delete", error);
      toaster.create({ type: "error", title: "Failed to delete watchlist. Please try again." });
      setDeleting(false);
    }
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
    <Flex direction="column" gap={2} position="relative" role="group">
      <CardArtworkLink selectionMode={selectionMode} watchlistId={watchlist.id}>
        <WatchlistCardArtwork
          watchlist={watchlist}
          selectionMode={selectionMode}
          isSelected={isSelected}
          showUpNextBadge={showUpNextBadge}
          onToggle={onToggle}
        />
      </CardArtworkLink>

      {!selectionMode ? (
        <WatchlistCardMenu
          watchlistName={watchlist.name}
          hasNextUnwatched={Boolean(watchlist.stats.nextUnwatched)}
          isPaused={watchlist.pausedAt !== null}
          skipping={skipping}
          pausePending={pausePending}
          onSkip={() => void handleSkip()}
          onTogglePause={() => void handleTogglePause()}
          onDelete={() => setDeleteOpen(true)}
        />
      ) : null}

      <DeleteWatchlistDialog
        watchlist={watchlist}
        open={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        deleting={deleting}
        handleDelete={() => void handleDelete()}
      />

      <WatchlistCardInfo watchlist={watchlist} infoVariant={infoVariant} />
    </Flex>
  );
}
