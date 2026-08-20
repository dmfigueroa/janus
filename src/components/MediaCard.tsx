import { UnifiedMedia } from "../server/Media";
import { Star } from "lucide-react";

interface MediaCardProps {
  media: UnifiedMedia;
  onClick: () => void;
}

const missingPosterUrl = "https://placehold.co/500x750/1a1a1a/666?text=No+Poster";

function getPosterUrl(poster: string | null | undefined) {
  return poster || missingPosterUrl;
}

function HighRatingStar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <Star className="size-3 fill-current" />;
}

function MediaRating({ rating }: { rating: number | null | undefined }) {
  if (!rating) return null;
  const isHighRating = rating >= 7.5;

  return (
    <div
      className={`absolute top-2 right-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-white shadow-sm backdrop-blur-md ${isHighRating ? "bg-primary" : "bg-black/40"}`}
    >
      <HighRatingStar visible={isHighRating} />
      <span>{rating.toFixed(1)}</span>
    </div>
  );
}

function MediaArtwork({ media }: { media: UnifiedMedia }) {
  return (
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary/30 shadow-sm border border-white/5 transition-all group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-primary/5">
      <img
        src={getPosterUrl(media.poster)}
        alt={media.title}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent opacity-60 transition-opacity group-hover:opacity-40" />
      <MediaRating rating={media.rating} />
    </div>
  );
}

function Authors({ authors }: { authors: string[] | undefined }) {
  if (!authors || authors.length === 0) return null;
  return <p className="line-clamp-1 text-xs text-muted-foreground">{authors.join(", ")}</p>;
}

function BookAuthors({ media }: { media: UnifiedMedia }) {
  if (media.mediaType !== "book") return null;
  return <Authors authors={media.authors} />;
}

function MediaDetails({ media }: { media: UnifiedMedia }) {
  return (
    <div className="space-y-0.5 px-1">
      <h3 className="line-clamp-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
        {media.title}
      </h3>
      <BookAuthors media={media} />
      <p className="text-xs text-muted-foreground">{media.year}</p>
    </div>
  );
}

export function MediaCard({ media, onClick }: MediaCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col gap-2 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
    >
      <MediaArtwork media={media} />
      <MediaDetails media={media} />
    </div>
  );
}
