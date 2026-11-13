import { GripVertical } from "lucide-react";
import { Box, Button, Flex } from "@chakra-ui/react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { TimelineItem } from "./TimelineItem";

export function TimelineRowShell({
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
