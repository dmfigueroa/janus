import { UnifiedMedia } from "../server/media";
import { MediaCard } from "./MediaCard";
import { useIntersectionObserver } from "../hooks/useIntersectionObserver";
import { useState } from "react";
import { MediaDetailSheet } from "./MediaDetailSheet";
import { CreateCustomItemDialog } from "./search/CreateCustomItemDialog";
import { Button } from "./ui/button";
import { Plus } from "lucide-react";

interface SearchResultsProps {
  results: UnifiedMedia[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

export function SearchResults({
  results,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: SearchResultsProps) {
  const [selectedMedia, setSelectedMedia] = useState<UnifiedMedia | null>(null);

  const { ref } = useIntersectionObserver({
    onIntersect: fetchNextPage,
    enabled: hasNextPage && !isFetchingNextPage,
  });

  return (
    <>
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-lg font-medium text-muted-foreground">No results found</div>
          <p className="text-sm text-zinc-500 mb-6">Try adjusting your search terms</p>
          <CreateCustomItemDialog onCreated={setSelectedMedia}>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Create Custom Item
            </Button>
          </CreateCustomItemDialog>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {results.map((item) => (
              <MediaCard key={item.id} media={item} onClick={() => setSelectedMedia(item)} />
            ))}
          </div>

          {(hasNextPage || isFetchingNextPage) && (
            <div ref={ref} className="flex justify-center py-4">
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {results.length > 0 && !hasNextPage && (
            <div className="flex flex-col items-center justify-center py-8 border-t">
              <p className="text-sm text-muted-foreground mb-4">
                Can't find what you're looking for?
              </p>
              <CreateCustomItemDialog onCreated={setSelectedMedia}>
                <Button variant="outline" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Custom Item
                </Button>
              </CreateCustomItemDialog>
            </div>
          )}
        </div>
      )}

      <MediaDetailSheet
        key={selectedMedia?.id}
        media={selectedMedia}
        isOpen={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
      />
    </>
  );
}
