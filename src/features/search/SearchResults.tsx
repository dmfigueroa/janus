import type { UnifiedMedia } from "@/server/Media";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useState, type Ref } from "react";
import { SearchMediaDetailSheet } from "./SearchMediaDetailSheet";
import { CreateCustomItemDialog } from "./CreateCustomItemDialog";
import { SearchMediaCard } from "./SearchMediaCard";
import { Box, Button, type ButtonProps, SimpleGrid, Spinner, Stack, Text } from "@chakra-ui/react";
import { Plus } from "lucide-react";

interface SearchResultsProps {
  results: UnifiedMedia[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

interface CreateCustomItemButtonProperties extends ButtonProps {
  compact?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

function CreateCustomItemButton({
  compact = false,
  ref,
  ...buttonProps
}: CreateCustomItemButtonProperties) {
  return (
    <Button ref={ref} variant="outline" size={compact ? "sm" : undefined} gap={2} {...buttonProps}>
      <Plus size={16} aria-hidden="true" />
      Create Custom Item
    </Button>
  );
}

function EmptyResults({ onCreated }: { onCreated: (media: UnifiedMedia) => void }) {
  return (
    <Stack align="center" justify="center" gap={1} py={20} textAlign="center">
      <Text fontSize="lg" fontWeight="medium" color="fg.muted">
        No results found
      </Text>
      <Text fontSize="sm" color="fg.muted" mb={5}>
        Try adjusting your search terms
      </Text>
      <CreateCustomItemDialog onCreated={onCreated}>
        <CreateCustomItemButton />
      </CreateCustomItemDialog>
    </Stack>
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
    <Box ref={observerRef} display="flex" justifyContent="center" py={4} role="status">
      <Spinner size="sm" colorPalette="pink" aria-label="Loading more results" />
    </Box>
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
    <Stack
      align="center"
      justify="center"
      gap={4}
      borderTopWidth="1px"
      borderColor="border.default"
      py={8}
    >
      <Text fontSize="sm" color="fg.muted">
        Can't find what you're looking for?
      </Text>
      <CreateCustomItemDialog onCreated={onCreated}>
        <CreateCustomItemButton compact />
      </CreateCustomItemDialog>
    </Stack>
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
    <Stack gap={8}>
      <SimpleGrid columns={{ base: 2, sm: 3, md: 4, lg: 5 }} gapX={4} gapY={8}>
        <SearchResultCards results={results} onSelect={onSelect} />
      </SimpleGrid>
      <LoadingMore visible={hasNextPage || isFetchingNextPage} observerRef={observerRef} />
      <EndOfResults visible={!hasNextPage} onCreated={onSelect} />
    </Stack>
  );
}

function SearchResultCards({
  results,
  onSelect,
}: {
  results: UnifiedMedia[];
  onSelect: (media: UnifiedMedia) => void;
}) {
  const cardProps = results.map((media) => ({ media, onSelect }));
  return cardProps.map(SearchResultCard);
}

function SearchResultCard({
  media,
  onSelect,
}: {
  media: UnifiedMedia;
  onSelect: (media: UnifiedMedia) => void;
}) {
  return <SearchMediaCard key={media.id} media={media} onClick={() => onSelect(media)} />;
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
