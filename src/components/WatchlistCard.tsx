import { Link as ChakraLink, Flex } from "@chakra-ui/react";
import { useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { deleteWatchlist } from "@/features/watchlists/delete/Mutation";
import { skipWatchlist } from "@/features/watchlists/skip/Mutation";
import { useState } from "react";
import { toast } from "sonner";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import {
  WatchlistCardInfo,
  type WatchlistCardInfoVariant,
} from "@/features/watchlists/components/WatchlistCardInfo";
import { WatchlistCardArtwork } from "@/features/watchlists/components/WatchlistCardArtwork";
import { DeleteWatchlistButton } from "./DeleteWatchlistButton";

export type EnrichedWatchlist = WatchlistSummary;

interface WatchlistCardProps {
  watchlist: EnrichedWatchlist;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  showDeleteButton?: boolean;
  showUpNextBadge?: boolean;
  showSkipButton?: boolean;
  infoVariant?: WatchlistCardInfoVariant;
}

function withDefault<T>(value: T | undefined, fallback: T) {
  if (value === undefined) return fallback;
  return value;
}

function ensureSuccessfulSkip(result: { success: boolean }) {
  if (!result.success) throw new Error("Failed to skip watchlist");
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

function WatchlistDeleteAction({
  visible,
  watchlist,
  deleting,
  handleDelete,
}: {
  visible: boolean;
  watchlist: EnrichedWatchlist;
  deleting: boolean;
  handleDelete: () => Promise<void>;
}) {
  if (!visible) return null;
  return (
    <DeleteWatchlistButton watchlist={watchlist} deleting={deleting} handleDelete={handleDelete} />
  );
}

export function WatchlistCard(cardProps: WatchlistCardProps) {
  const {
    watchlist,
    selectionMode,
    isSelected,
    onToggle,
    showDeleteButton,
    showUpNextBadge,
    showSkipButton,
    infoVariant,
  } = {
    ...cardProps,
    selectionMode: withDefault(cardProps.selectionMode, false),
    isSelected: withDefault(cardProps.isSelected, false),
    showDeleteButton: withDefault(cardProps.showDeleteButton, true),
    showUpNextBadge: withDefault(cardProps.showUpNextBadge, true),
    showSkipButton: withDefault(cardProps.showSkipButton, false),
    infoVariant: withDefault(cardProps.infoVariant, "watchlist"),
  };
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const deleteWatchlistFn = useServerFn(deleteWatchlist);
  const skipWatchlistFn = useServerFn(skipWatchlist);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWatchlistFn({ data: { id: watchlist.id } });
      await router.invalidate?.();
      toast.success("Watchlist deleted successfully");
    } catch (error) {
      console.error("Failed to delete", error);
      toast.error("Failed to delete watchlist. Please try again.");
      setDeleting(false);
    }
  };

  const handleSkip = async () => {
    setSkipping(true);
    try {
      const result = await skipWatchlistFn({ data: { watchlistId: watchlist.id } });
      ensureSuccessfulSkip(result);
      await router.invalidate?.();
    } catch (error) {
      console.error("Failed to skip watchlist", error);
      toast.error("Failed to skip watchlist. Please try again.");
    } finally {
      setSkipping(false);
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
          showSkipButton={showSkipButton}
          skipping={skipping}
          onToggle={onToggle}
          onSkip={() => void handleSkip()}
        />
      </CardArtworkLink>

      <WatchlistDeleteAction
        visible={showDeleteButton && !selectionMode}
        watchlist={watchlist}
        deleting={deleting}
        handleDelete={handleDelete}
      />

      <WatchlistCardInfo watchlist={watchlist} infoVariant={infoVariant} />
    </Flex>
  );
}
