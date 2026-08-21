import { Drawer, Portal } from "@chakra-ui/react";
import { X } from "lucide-react";
import type { UnifiedMedia } from "@/server/Media";
import { SearchMediaSummary } from "./SearchMediaSummary";
import { SearchMediaWatchlistControls } from "./SearchMediaWatchlistControls";
import { useSearchMediaDetail } from "./useSearchMediaDetail";

interface SearchMediaDetailSheetProps {
  media: UnifiedMedia | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SearchMediaDetailSheet({ media, isOpen, onClose }: SearchMediaDetailSheetProps) {
  const detail = useSearchMediaDetail({ media, isOpen, onClose });

  if (!media) return null;

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      placement="end"
      size="md"
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content maxW="100vw">
            <Drawer.CloseTrigger aria-label="Close media details">
              <X size={16} />
            </Drawer.CloseTrigger>
            <Drawer.Body p={{ base: 6, sm: 8 }}>
              <SearchMediaSummary media={media} />
              <SearchMediaWatchlistControls
                mediaType={media.mediaType}
                watchlists={detail.watchlists}
                selectedWatchlistId={detail.selectedWatchlistId}
                insertionPosition={detail.insertionPosition}
                requiresInsertionChoice={detail.requiresInsertionChoice}
                isAdding={detail.isAdding}
                onWatchlistSelect={detail.onWatchlistSelect}
                onInsertionPositionChange={detail.onInsertionPositionChange}
                onAdd={detail.onAdd}
              />
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
