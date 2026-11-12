import { useSortable } from "@dnd-kit/sortable";
import { CSS, type Transform } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Box, Button, Flex } from "@chakra-ui/react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { TimelineItem } from "./TimelineItem";

type ReorderableTimelineRowProps = {
  item: WatchlistItem;
  showHandleSlot: boolean;
  showHandle: boolean;
  interactionDisabled: boolean;
  itemOrderMode?: WatchlistItemOrderMode;
};

export function ReorderableTimelineRow({
  item,
  showHandleSlot,
  showHandle,
  interactionDisabled,
  itemOrderMode,
}: ReorderableTimelineRowProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id: item.id,
    disabled: !showHandle,
    animateLayoutChanges: ({ isSorting: sorting }) => sorting,
  });
  const style = sortableRowStyle(isSorting, transform, transition);

  return (
    <Box
      ref={setNodeRef}
      data-testid={`watchlist-timeline-row-${item.id}`}
      style={style}
      rounded="xl"
      opacity={isDragging ? 0 : 1}
    >
      <TimelineRowShell
        item={item}
        showHandleSlot={showHandleSlot}
        showHandle={showHandle}
        interactionDisabled={interactionDisabled}
        itemOrderMode={itemOrderMode}
        dragging={isDragging}
        handleProps={{
          ...attributes,
          ...listeners,
          ref: setActivatorNodeRef,
        }}
      />
    </Box>
  );
}

export function DragOverlayTimelineRow({
  item,
  itemOrderMode,
}: {
  item: WatchlistItem;
  itemOrderMode: WatchlistItemOrderMode;
}) {
  return (
    <Box
      rounded="xl"
      bg="bg.canvas/95"
      shadow="overlay"
      outlineWidth="1px"
      outlineStyle="solid"
      outlineColor="border.default"
    >
      <TimelineRowShell
        item={item}
        showHandleSlot
        showHandle
        interactionDisabled
        itemOrderMode={itemOrderMode}
        dragging
      />
    </Box>
  );
}

function TimelineRowShell({
  item,
  showHandleSlot,
  showHandle,
  interactionDisabled,
  itemOrderMode,
  dragging,
  handleProps,
}: {
  item: WatchlistItem;
  showHandleSlot: boolean;
  showHandle: boolean;
  interactionDisabled: boolean;
  itemOrderMode?: WatchlistItemOrderMode;
  dragging: boolean;
  handleProps?: Record<string, unknown>;
}) {
  return (
    <Flex align="center" gap={2} rounded="xl" bg="bg.canvas/80">
      <TimelineDragHandle
        itemTitle={item.title}
        showHandleSlot={showHandleSlot}
        showHandle={showHandle}
        dragging={dragging}
        handleProps={handleProps}
      />

      <Box minW={0} flex={1}>
        <TimelineItem
          item={item}
          interactionDisabled={interactionDisabled}
          itemOrderMode={itemOrderMode}
        />
      </Box>
    </Flex>
  );
}

function TimelineDragHandle({
  itemTitle,
  showHandleSlot,
  showHandle,
  dragging,
  handleProps,
}: {
  itemTitle: string;
  showHandleSlot: boolean;
  showHandle: boolean;
  dragging: boolean;
  handleProps?: Record<string, unknown>;
}) {
  if (!showHandle) {
    return <EmptyHandleSlot show={showHandleSlot} />;
  }

  return <DragHandleButton itemTitle={itemTitle} dragging={dragging} handleProps={handleProps} />;
}

function DragHandleButton({
  itemTitle,
  dragging,
  handleProps,
}: {
  itemTitle: string;
  dragging: boolean;
  handleProps?: Record<string, unknown>;
}) {
  const dragStyles = dragging
    ? { cursor: "grabbing", bg: "bg.subtle", shadow: "sm" }
    : { cursor: "grab", bg: undefined, shadow: undefined };
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={`Move ${itemTitle}`}
      onMouseDown={(event) => {
        // Prevent the handle from stealing focus and scrolling back into view after drop.
        event.preventDefault();
      }}
      minW={8}
      h={8}
      p={0}
      flexShrink={0}
      rounded="md"
      color="fg.muted"
      style={{ touchAction: "none", userSelect: "none" }}
      {...dragStyles}
      _hover={{ bg: "bg.subtle", color: "fg.default" }}
      {...handleProps}
    >
      <GripVertical size={16} />
    </Button>
  );
}

function EmptyHandleSlot({ show }: { show: boolean }) {
  return show ? <Box aria-hidden w={8} h={8} flexShrink={0} /> : null;
}

function sortableRowStyle(
  isSorting: boolean,
  transform: Transform | null,
  transition: string | undefined,
) {
  // After release the cache owns row positions. Replaying layout transforms
  // after its asynchronous update briefly overshoots the final slot.
  return {
    transform: isSorting ? CSS.Transform.toString(transform) : undefined,
    transition: isSorting ? transition : undefined,
  };
}
