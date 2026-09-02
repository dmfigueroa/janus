import { Box } from "@chakra-ui/react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { WatchlistCardActions } from "./WatchlistCardActions";
import { WatchlistCardCover } from "./WatchlistCardCover";
import { WatchlistCardSurface } from "./WatchlistCardSurface";

interface WatchlistCardArtworkProps {
  watchlist: WatchlistSummary;
  selectionMode: boolean;
  isSelected: boolean;
  showUpNextBadge: boolean;
  onToggle?: () => void;
}

export function WatchlistCardArtwork({
  watchlist,
  selectionMode,
  isSelected,
  showUpNextBadge,
  onToggle,
}: WatchlistCardArtworkProps) {
  return (
    <WatchlistCardSurface
      selectionMode={selectionMode}
      isSelected={isSelected}
      watchlistName={watchlist.name}
      onToggle={onToggle}
    >
      <WatchlistCardCover watchlist={watchlist} />
      <Box
        position="absolute"
        inset={0}
        bgGradient="to-t"
        gradientFrom="blackAlpha.700"
        gradientTo="transparent"
        opacity={0.6}
      />
      <WatchlistCardActions
        hasNextUnwatched={Boolean(watchlist.stats.nextUnwatched)}
        selectionMode={selectionMode}
        showUpNextBadge={showUpNextBadge}
      />
    </WatchlistCardSurface>
  );
}
