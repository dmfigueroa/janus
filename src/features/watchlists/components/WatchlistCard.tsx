import { Link as ChakraLink, Flex } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import {
  WatchlistCardInfo,
  type WatchlistCardInfoVariant,
} from "@/features/watchlists/components/WatchlistCardInfo";
import { WatchlistCardArtwork } from "@/features/watchlists/components/WatchlistCardArtwork";
import { WatchlistCardMenu } from "@/features/watchlists/components/WatchlistCardMenu";

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

  return (
    <Flex direction="column" gap={2} position="relative" role="group" className="group">
      <CardArtworkLink selectionMode={selectionMode} watchlistId={watchlist.id}>
        <WatchlistCardArtwork
          watchlist={watchlist}
          selectionMode={selectionMode}
          isSelected={isSelected}
          showUpNextBadge={showUpNextBadge}
          onToggle={onToggle}
        />
      </CardArtworkLink>

      {!selectionMode ? <WatchlistCardMenu watchlist={watchlist} /> : null}

      <WatchlistCardInfo watchlist={watchlist} infoVariant={infoVariant} />
    </Flex>
  );
}
