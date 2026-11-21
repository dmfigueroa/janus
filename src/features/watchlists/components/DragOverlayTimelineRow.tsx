import { Box } from "@chakra-ui/react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { TimelineRowShell } from "./TimelineRowShell";

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
