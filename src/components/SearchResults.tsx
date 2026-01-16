import { TMDBMedia } from "../server/tmdb";
import { MediaCard } from "./MediaCard";

interface SearchResultsProps {
  results: TMDBMedia[];
}

export function SearchResults({ results }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-lg font-medium text-muted-foreground">No results found</div>
        <p className="text-sm text-zinc-500">Try adjusting your search terms</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {results.map((item) => (
        <MediaCard key={item.id} media={item} />
      ))}
    </div>
  );
}
