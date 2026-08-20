import { Check } from "lucide-react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { cn } from "@/utils/Cn";
import { buildMediaPosterUrl } from "@/utils/Tmdb";

function WatchlistCoverImage({ watchlist }: { watchlist: WatchlistSummary }) {
  const { stats } = watchlist;
  if (!stats.coverImage) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/20" />
    );
  }

  const coverImageUrl = buildMediaPosterUrl(stats.coverImage, "w500");
  if (stats.coverMediaType !== "episode") {
    return (
      <img
        src={coverImageUrl}
        alt={watchlist.name}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 overflow-hidden">
      <img
        src={coverImageUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover blur-2xl scale-150 opacity-80"
      />
      <div className="relative z-10 w-full aspect-video shadow-2xl">
        <img
          src={coverImageUrl}
          alt={watchlist.name}
          className="w-full h-full object-cover rounded-sm shadow-black/50"
        />
      </div>
    </div>
  );
}

interface WatchlistCardArtworkProps {
  watchlist: WatchlistSummary;
  selectionMode: boolean;
  isSelected: boolean;
  showUpNextBadge: boolean;
  showSkipButton: boolean;
  skipping: boolean;
  onToggle?: () => void;
  onSkip: () => void;
}

export function WatchlistCardArtwork({
  watchlist,
  selectionMode,
  isSelected,
  showUpNextBadge,
  showSkipButton,
  skipping,
  onToggle,
  onSkip,
}: WatchlistCardArtworkProps) {
  const { stats } = watchlist;

  return (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-2xl border-none shadow-2xl transition-all duration-300",
        !stats.coverImage && "bg-gradient-to-br from-zinc-800 to-zinc-900",
        getSelectionModeClass(selectionMode),
        isSelected && "ring-4 ring-primary",
      )}
      onClick={(event) => handleArtworkClick(event, selectionMode, onToggle)}
    >
      <WatchlistCoverImage watchlist={watchlist} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
      <SelectionIndicator selectionMode={selectionMode} isSelected={isSelected} />
      <UnwatchedActions
        hasNextUnwatched={Boolean(stats.nextUnwatched)}
        selectionMode={selectionMode}
        showUpNextBadge={showUpNextBadge}
        showSkipButton={showSkipButton}
        skipping={skipping}
        watchlistName={watchlist.name}
        onSkip={onSkip}
      />
    </div>
  );
}

function getSelectionModeClass(selectionMode: boolean) {
  return selectionMode ? "cursor-pointer scale-[0.98]" : "group-hover:scale-[1.02]";
}

function handleArtworkClick(
  event: React.MouseEvent,
  selectionMode: boolean,
  onToggle: (() => void) | undefined,
) {
  if (!selectionMode) {
    return;
  }

  event.preventDefault();
  onToggle?.();
}

function SelectionIndicator({
  selectionMode,
  isSelected,
}: {
  selectionMode: boolean;
  isSelected: boolean;
}) {
  if (!selectionMode) {
    return null;
  }

  return (
    <div className="absolute top-3 right-3 z-30">
      <div
        className={cn(
          "h-6 w-6 rounded-full border-2 border-white flex items-center justify-center transition-colors",
          getSelectionIndicatorClass(isSelected),
        )}
      >
        <SelectedCheck selected={isSelected} />
      </div>
    </div>
  );
}

function getSelectionIndicatorClass(isSelected: boolean) {
  return isSelected ? "bg-primary border-primary" : "bg-black/40";
}

function SelectedCheck({ selected }: { selected: boolean }) {
  return selected ? <Check className="w-4 h-4 text-white" /> : null;
}

type UnwatchedActionsProps = {
  hasNextUnwatched: boolean;
  selectionMode: boolean;
  showUpNextBadge: boolean;
  showSkipButton: boolean;
  skipping: boolean;
  watchlistName: string;
  onSkip: () => void;
};

function UnwatchedActions(props: UnwatchedActionsProps) {
  if (!shouldShowUnwatchedActions(props)) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-3 right-3 top-3 z-20 flex items-start gap-2",
        props.showUpNextBadge ? "justify-between" : "justify-end",
      )}
    >
      <UpNextBadge show={props.showUpNextBadge} />
      <SkipButton {...props} />
    </div>
  );
}

function shouldShowUnwatchedActions(props: UnwatchedActionsProps) {
  if (props.selectionMode) return false;
  return hasUnwatchedActions(props);
}

function hasUnwatchedActions({
  hasNextUnwatched,
  showUpNextBadge,
  showSkipButton,
}: UnwatchedActionsProps) {
  return hasNextUnwatched && (showUpNextBadge || showSkipButton);
}

function UpNextBadge({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }

  return (
    <div className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-md shadow-lg">
      UP NEXT
    </div>
  );
}

function SkipButton({ showSkipButton, skipping, watchlistName, onSkip }: UnwatchedActionsProps) {
  if (!showSkipButton) {
    return null;
  }

  return (
    <button
      type="button"
      className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold text-white shadow-lg transition-colors hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-70"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSkip();
      }}
      disabled={skipping}
      aria-label={`Skip ${watchlistName}`}
    >
      Skip
    </button>
  );
}
