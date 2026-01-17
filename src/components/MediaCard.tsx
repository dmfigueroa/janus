import { TMDBMedia } from "../server/tmdb";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";

interface MediaCardProps {
  media: TMDBMedia;
  onClick?: () => void;
}

export function MediaCard({ media, onClick }: MediaCardProps) {
  const title = media.title || media.name || "Unknown Title";
  const date = media.release_date || media.first_air_date;
  const year = date ? date.split("-")[0] : "TBA";
  const posterUrl = media.poster_path
    ? `https://image.tmdb.org/t/p/w500${media.poster_path}`
    : "https://placehold.co/500x750/1a1a1a/666?text=No+Poster"; // Fallback

  const rating = media.vote_average ? media.vote_average.toFixed(1) : null;
  const isHighRating = media.vote_average >= 7.5;

  const CardContent = (
    <>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary/30 shadow-sm border border-white/5 transition-all group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-primary/5">
        <img
          src={posterUrl}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        {/* Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent opacity-60 transition-opacity group-hover:opacity-40" />

        {/* Rating Badge */}
        {rating && (
          <div
            className={`absolute top-2 right-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-white shadow-sm backdrop-blur-md ${isHighRating ? "bg-primary" : "bg-black/40"}`}
          >
            {isHighRating && <Star className="size-3 fill-current" />}
            <span>{rating}</span>
          </div>
        )}
      </div>

      <div className="space-y-0.5 px-1">
        <h3 className="line-clamp-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">{year}</p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <div
        onClick={onClick}
        className="group relative flex flex-col gap-2 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
      >
        {CardContent}
      </div>
    );
  }

  return (
    <Link
      to="."
      className="group relative flex flex-col gap-2 transition-all duration-300 hover:scale-[1.02]"
    >
      {CardContent}
    </Link>
  );
}
