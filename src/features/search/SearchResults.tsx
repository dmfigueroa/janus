import type { UnifiedMedia } from "@/server/Media";
import { MediaCard } from "@/components/MediaCard";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useState } from "react";
import { SearchMediaDetailSheet } from "./SearchMediaDetailSheet";
import { CreateCustomItemDialog } from "./CreateCustomItemDialog";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";

interface SearchResultsProps {
  results: UnifiedMedia[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

function CreateCustomItemButton({ compact = false }: { compact?: boolean }) {
  return (
    <Button variant="outline" size={compact ? "sm" : undefined}>
      <Plus className="mr-2 h-4 w-4" />
      Create Custom Item
    </Button>
  );
}

function EmptyResults({ onCreated }: { onCreated: (media: UnifiedMedia) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-lg font-medium text-muted-foreground">No results found</div>
      <p className="text-sm text-zinc-500 mb-6">Try adjusting your search terms</p>
      <CreateCustomItemDialog onCreated={onCreated}>
        <CreateCustomItemButton />
      </CreateCustomItemDialog>
    </div>
  );
}

function LoadingMore({
  visible,
  observerRef,
}: {
  visible: boolean;
  observerRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!visible) return null;
  return (
    <div ref={observerRef} className="flex justify-center py-4">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function EndOfResults({
  visible,
  onCreated,
}: {
  visible: boolean;
  onCreated: (media: UnifiedMedia) => void;
}) {
  if (!visible) return null;
  return (
    <div className="flex flex-col items-center justify-center py-8 border-t">
      <p className="text-sm text-muted-foreground mb-4">Can't find what you're looking for?</p>
      <CreateCustomItemDialog onCreated={onCreated}>
        <CreateCustomItemButton compact />
      </CreateCustomItemDialog>
    </div>
  );
}

function PopulatedResults({
  results,
  hasNextPage,
  isFetchingNextPage,
  observerRef,
  onSelect,
}: {
  results: UnifiedMedia[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  observerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (media: UnifiedMedia) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {results.map((item) => (
          <MediaCard key={item.id} media={item} onClick={() => onSelect(item)} />
        ))}
      </div>
      <LoadingMore visible={hasNextPage || isFetchingNextPage} observerRef={observerRef} />
      <EndOfResults visible={!hasNextPage} onCreated={onSelect} />
    </div>
  );
}

function ResultsContent(props: Parameters<typeof PopulatedResults>[0]) {
  if (props.results.length === 0) return <EmptyResults onCreated={props.onSelect} />;
  return <PopulatedResults {...props} />;
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
      <ResultsContent
        results={results}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        observerRef={ref}
        onSelect={setSelectedMedia}
      />

      <SearchMediaDetailSheet
        key={selectedMedia?.id}
        media={selectedMedia}
        isOpen={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
      />
    </>
  );
}
