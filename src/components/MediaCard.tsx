import { UnifiedMedia } from "../server/external-apis";
import { Star } from "lucide-react";

interface MediaCardProps {
  media: UnifiedMedia;
  onClick: () => void;
}

export function MediaCard({ media, onClick }: MediaCardProps) {
  const posterUrl = media.poster || "https://placehold.co/500x750/1a1a1a/666?text=No+Poster";

  const isHighRating = (media.rating || 0) >= 7.5;
  const displayRating = media.rating ? media.rating.toFixed(1) : null;

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col gap-2 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary/30 shadow-sm border border-white/5 transition-all group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-primary/5">
        <img
          src={posterUrl}
          alt={media.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent opacity-60 transition-opacity group-hover:opacity-40" />

        {media.rating && (
          <div
            className={`absolute top-2 right-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-white shadow-sm backdrop-blur-md ${isHighRating ? "bg-primary" : "bg-black/40"}`}
          >
            {isHighRating && <Star className="size-3 fill-current" />}
            <span>{displayRating}</span>
          </div>
        )}
      </div>

      <div className="space-y-0.5 px-1">
        <h3 className="line-clamp-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {media.title}
        </h3>
        <p className="text-xs text-muted-foreground">{media.year}</p>
      </div>
    </div>
  );
}
