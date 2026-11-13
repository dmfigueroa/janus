import { useSortable } from "@dnd-kit/sortable";
import { CSS, type Transform } from "@dnd-kit/utilities";
import { Box } from "@chakra-ui/react";
import { memo } from "react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { TimelineRowShell } from "./TimelineRowShell";

export type ReorderableTimelineRowProps = {
  item: WatchlistItem;
  showHandleSlot: boolean;
  showHandle: boolean;
  interactionDisabled: boolean;
  itemOrderMode?: WatchlistItemOrderMode;
};

/**
 * Rows without a drag handle skip the sortable registration entirely. Release-mode
 * timelines and pending reorder states mount hundreds of rows that never drag, and
 * every `useSortable` still measures, subscribes, and registers a droppable.
 */
export const ReorderableTimelineRow = memo(function ReorderableTimelineRow(
  props: ReorderableTimelineRowProps,
) {
  if (!props.showHandle) {
    return <StaticTimelineRow {...props} />;
  }

  return <SortableTimelineRow {...props} />;
});

function StaticTimelineRow({
  item,
  showHandleSlot,
  interactionDisabled,
  itemOrderMode,
}: ReorderableTimelineRowProps) {
  return (
    <Box data-testid={`watchlist-timeline-row-${item.id}`} rounded="xl">
      <TimelineRowShell
        item={item}
        showHandleSlot={showHandleSlot}
        showHandle={false}
        interactionDisabled={interactionDisabled}
        itemOrderMode={itemOrderMode}
        dragging={false}
      />
    </Box>
  );
}

function SortableTimelineRow({
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
