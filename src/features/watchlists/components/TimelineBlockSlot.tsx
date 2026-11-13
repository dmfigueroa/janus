import { Box } from "@chakra-ui/react";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { WatchlistTimelineBlockContent } from "./WatchlistTimelineBlocks";
import type { WatchlistTimelineBlock } from "./WatchlistTimeline.model";

export type TimelineBlockSlotProps = {
  block: WatchlistTimelineBlock;
  index: number;
  start: number;
  measureElement: (node: Element | null) => void;
  key: React.Key;
  itemOrderMode: WatchlistItemOrderMode;
  showHandleSlot: boolean;
  showHandle: boolean;
  interactionDisabled: boolean;
  onToggleRun: (runKey: string) => void;
};

export function TimelineBlockSlots({ slotProps }: { slotProps: TimelineBlockSlotProps[] }) {
  return slotProps.map(TimelineBlockSlot);
}

function TimelineBlockSlot({
  block,
  index,
  start,
  measureElement,
  itemOrderMode,
  showHandleSlot,
  showHandle,
  interactionDisabled,
  onToggleRun,
}: TimelineBlockSlotProps) {
  return (
    <div
      ref={measureElement}
      data-index={index}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${start}px)`,
      }}
    >
      <Box pb={block.groupEnd ? 8 : 2}>
        <WatchlistTimelineBlockContent
          block={block}
          itemOrderMode={itemOrderMode}
          showHandleSlot={showHandleSlot}
          showHandle={showHandle}
          interactionDisabled={interactionDisabled}
          onToggleRun={onToggleRun}
        />
      </Box>
    </div>
  );
}
