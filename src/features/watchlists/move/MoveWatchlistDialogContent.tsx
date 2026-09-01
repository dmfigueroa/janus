import { Button, Dialog, Portal, Stack } from "@chakra-ui/react";
import type { WatchlistItem } from "@/db/Schema";
import { ItemPreview } from "@/features/watchlists/components/ItemPreview";
import type { InsertionPosition } from "@/features/watchlists/Order";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { AutoOrderingNotice } from "./AutoOrderingNotice";
import { PositionPicker } from "./PositionPicker";
import { WatchlistSelector } from "./WatchlistSelector";

type MoveWatchlistDialogContentProps = {
  item: WatchlistItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  watchlists: WatchlistSummary[];
  selectedWatchlistId: number | null;
  onSelectedWatchlistIdChange: (id: number) => void;
  selectedPosition: InsertionPosition;
  onSelectedPositionChange: (position: InsertionPosition) => void;
  isCustomOrdered: boolean;
  isLoading: boolean;
  isError: boolean;
  isPending: boolean;
  onMove: () => void;
};

export function MoveWatchlistDialogContent({
  item,
  open,
  onOpenChange,
  title,
  description,
  watchlists,
  selectedWatchlistId,
  onSelectedWatchlistIdChange,
  selectedPosition,
  onSelectedPositionChange,
  isCustomOrdered,
  isLoading,
  isError,
  isPending,
  onMove,
}: MoveWatchlistDialogContentProps) {
  const moveDisabled = [selectedWatchlistId === null, isPending, isLoading].some(Boolean);
  const moveLabel = getMoveLabel(isPending);

  return (
    <Dialog.Root open={open} onOpenChange={({ open: nextOpen }) => onOpenChange(nextOpen)}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            maxH="80vh"
            maxW={{ base: "calc(100% - 2rem)", sm: "lg" }}
            overflow="hidden"
          >
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description srOnly>{description}</Dialog.Description>
            </Dialog.Header>
            <Dialog.Body overflowY="auto">
              <Stack gap={4} minH={0}>
                <ItemPreview item={item} />
                <WatchlistSelector
                  watchlists={watchlists}
                  selectedId={selectedWatchlistId}
                  isLoading={isLoading}
                  isError={isError}
                  disabled={isPending}
                  onSelect={onSelectedWatchlistIdChange}
                />
                <DestinationOrdering
                  selected={selectedWatchlistId !== null}
                  isCustomOrdered={isCustomOrdered}
                  selectedPosition={selectedPosition}
                  onSelectedPositionChange={onSelectedPositionChange}
                />
              </Stack>
            </Dialog.Body>
            <Dialog.Footer flexDir={{ base: "column-reverse", sm: "row" }}>
              <Button
                variant="outline"
                w={{ base: "full", sm: "auto" }}
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                colorPalette="pink"
                w={{ base: "full", sm: "auto" }}
                disabled={moveDisabled}
                onClick={onMove}
              >
                {moveLabel}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function getMoveLabel(isPending: boolean) {
  return isPending ? "Moving..." : "Move";
}

function DestinationOrdering({
  selected,
  isCustomOrdered,
  selectedPosition,
  onSelectedPositionChange,
}: {
  selected: boolean;
  isCustomOrdered: boolean;
  selectedPosition: InsertionPosition;
  onSelectedPositionChange: (position: InsertionPosition) => void;
}) {
  if (!selected) return null;
  if (!isCustomOrdered) return <AutoOrderingNotice />;
  return <PositionPicker value={selectedPosition} onChange={onSelectedPositionChange} />;
}
