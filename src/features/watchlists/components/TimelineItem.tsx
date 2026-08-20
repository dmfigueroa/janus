import { cn } from "@/utils/Cn";
import { Check, Film, Tv, Gamepad2, Book, BookOpen } from "lucide-react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import { formatReleaseDate, formatRuntime } from "@/utils/Datetime";
import { buildMediaPosterUrl } from "@/utils/Tmdb";
import { useToggleWatchedItem } from "@/features/watchlists/detail/useToggleWatchedItem";
import { TimelineItemActions } from "./TimelineItemActions";

type TimelineItemProps = {
  item: WatchlistItem;
  activeFilters?: WatchlistDetailQueryFilters;
  interactionDisabled?: boolean;
};

const mediaConfig = {
  movie: { label: "Movie", icon: Film, isPortrait: true },
  episode: { label: null, icon: Tv, isPortrait: false },
  game: { label: "Game", icon: Gamepad2, isPortrait: true },
  book: { label: "Book", icon: Book, isPortrait: true },
  comic: { label: "Comic", icon: BookOpen, isPortrait: true },
} as const;

const defaultMediaConfig = { label: null, icon: Film, isPortrait: true } as const;

const getMediaConfig = (type: string) =>
  Object.prototype.hasOwnProperty.call(mediaConfig, type)
    ? mediaConfig[type as keyof typeof mediaConfig]
    : defaultMediaConfig;

const Poster = ({ mediaType, posterPath, title }: WatchlistItem) => {
  const config = getMediaConfig(mediaType);
  const Icon = config.icon;

  const posterUrl = buildMediaPosterUrl(posterPath, "w200");

  return (
    <div className="flex w-20 md:w-28 shrink-0 justify-center">
      <div
        className={cn(
          "relative shrink-0 overflow-hidden font-bold shadow-md ring-1 ring-border",
          config.isPortrait
            ? "h-24 w-16 md:h-32 md:w-20 rounded-lg"
            : "h-12 md:h-16 w-full rounded-md",
        )}
      >
        <PosterImage posterUrl={posterUrl} title={title} Icon={Icon} />
        <MediaLabel label={config.label} />
      </div>
    </div>
  );
};

function PosterImage({
  posterUrl,
  title,
  Icon,
}: {
  posterUrl: string;
  title: string;
  Icon: typeof Film;
}) {
  if (!posterUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground">
        <Icon size={20} />
      </div>
    );
  }

  return (
    <img
      src={posterUrl}
      alt={title}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
    />
  );
}

function MediaLabel({ label }: { label: string | null }) {
  if (!label) {
    return null;
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center text-[10px] uppercase tracking-wider text-white backdrop-blur-[2px]">
      {label}
    </div>
  );
}

const Content = ({
  parentTitle,
  title,
  mediaType,
  season,
  episode,
  releaseDate,
  runtime,
  authors,
}: WatchlistItem) => {
  const formattedDate = formatReleaseDate(releaseDate);
  const runtimeStr = formatRuntime(runtime);

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
      <ParentTitle title={parentTitle} />
      <h3 className="text-base font-semibold leading-tight text-foreground md:text-lg">{title}</h3>
      <BookAuthors mediaType={mediaType} authors={authors} />
      <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm text-muted-foreground">
        <ItemSequence mediaType={mediaType} season={season} episode={episode} />
        <span>{formattedDate}</span>
        <Runtime runtime={runtimeStr} />
      </div>
    </div>
  );
};

function ParentTitle({ title }: { title: string | null }) {
  if (!title) return null;
  return <span className="text-xs font-medium uppercase tracking-wider text-primary">{title}</span>;
}

function BookAuthors({ mediaType, authors }: Pick<WatchlistItem, "mediaType" | "authors">) {
  if (mediaType !== "book") return null;
  return <Authors authors={authors} />;
}

function Authors({ authors }: Pick<WatchlistItem, "authors">) {
  if (!authors) return null;
  if (authors.length === 0) return null;
  return <p className="text-xs text-muted-foreground">{authors.join(", ")}</p>;
}

function ItemSequence({
  mediaType,
  season,
  episode,
}: Pick<WatchlistItem, "mediaType" | "season" | "episode">) {
  if (mediaType === "movie") return null;
  if (mediaType === "comic") return <ComicIssue episode={episode} />;
  return <SeasonEpisode season={season} episode={episode} />;
}

function ComicIssue({ episode }: Pick<WatchlistItem, "episode">) {
  if (!episode) return null;
  return <span>Issue #{episode}</span>;
}

function SeasonEpisode({ season, episode }: Pick<WatchlistItem, "season" | "episode">) {
  if (!season) return null;
  if (!episode) return null;
  return (
    <span>
      S{season} E{episode}
    </span>
  );
}

function Runtime({ runtime }: { runtime: string | null }) {
  if (!runtime) return null;
  return <span className="flex items-center gap-1">• {runtime}</span>;
}

export function TimelineItem({ item, activeFilters, interactionDisabled }: TimelineItemProps) {
  const toggleMutation = useToggleWatchedItem(item);
  const interactionsDisabled = Boolean(interactionDisabled);
  const isDisabled = interactionsDisabled || toggleMutation.isPending;

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 md:gap-4 py-3 md:py-4 pr-2 md:pr-4 transition-opacity",
        getWatchedOpacityClass(item.isWatched),
      )}
    >
      <Poster {...item} />
      <Content {...item} />

      {activeFilters ? (
        <TimelineItemActions
          item={item}
          activeFilters={activeFilters}
          interactionDisabled={interactionsDisabled}
        />
      ) : null}

      <button
        onClick={() => toggleMutation.mutate()}
        disabled={isDisabled}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-all hover:scale-110 active:scale-95 disabled:pointer-events-none",
          getWatchedButtonClass(item.isWatched),
        )}
      >
        <Check
          size={16}
          strokeWidth={3}
          className={cn("transition-all", getCheckScaleClass(item.isWatched))}
        />
      </button>
    </div>
  );
}

function getWatchedOpacityClass(isWatched: WatchlistItem["isWatched"]) {
  return isWatched ? "opacity-60" : undefined;
}

function getWatchedButtonClass(isWatched: WatchlistItem["isWatched"]) {
  return isWatched
    ? "border-primary bg-primary text-primary-foreground shadow-[0_0_10px_rgba(255,0,85,0.4)]"
    : "border-muted-foreground/30 text-transparent hover:border-primary/50";
}

function getCheckScaleClass(isWatched: WatchlistItem["isWatched"]) {
  return isWatched ? "scale-100" : "scale-0";
}
