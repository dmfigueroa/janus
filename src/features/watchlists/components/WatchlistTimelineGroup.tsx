import { Box, Flex } from "@chakra-ui/react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import type { WatchlistTimelineGroup } from "./WatchlistTimeline.model";
import { ReorderableTimelineRow } from "./ReorderableTimelineRow";

export function WatchlistTimelineGroupSection({
  group,
  activeFilters,
  itemOrderMode,
  interactionDisabled,
  reorderEnabled,
  showHandleSlot,
}: {
  group: WatchlistTimelineGroup;
  activeFilters: WatchlistDetailQueryFilters;
  itemOrderMode: WatchlistItemOrderMode;
  interactionDisabled: boolean;
  reorderEnabled: boolean;
  showHandleSlot: boolean;
}) {
  const releaseMode = itemOrderMode === "release";
  return (
    <Box position="relative" mb={8}>
      {releaseMode ? <TimelineYearHeader year={group.year} /> : null}
      <SortableContext
        items={group.items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <Box
          display="flex"
          flexDirection="column"
          gap={2}
          pl={releaseMode ? { base: 0, md: 16 } : 0}
        >
          <TimelineRows
            items={group.items}
            activeFilters={activeFilters}
            showHandleSlot={showHandleSlot}
            reorderEnabled={reorderEnabled}
            interactionDisabled={interactionDisabled}
          />
        </Box>
      </SortableContext>
    </Box>
  );
}

function TimelineRows({
  items,
  activeFilters,
  showHandleSlot,
  reorderEnabled,
  interactionDisabled,
}: {
  items: WatchlistItem[];
  activeFilters: WatchlistDetailQueryFilters;
  showHandleSlot: boolean;
  reorderEnabled: boolean;
  interactionDisabled: boolean;
}) {
  const rowProps = items.map((item) => ({
    key: item.id,
    item,
    activeFilters,
    showHandleSlot,
    showHandle: showHandleSlot && reorderEnabled,
    interactionDisabled,
  }));
  return rowProps.map(TimelineRow);
}

function TimelineRow(props: React.ComponentProps<typeof ReorderableTimelineRow> & { key: number }) {
  return <ReorderableTimelineRow {...props} />;
}

function TimelineYearHeader({ year }: { year: string }) {
  return (
    <Flex position="sticky" top={{ base: "11rem", md: "12rem" }} zIndex={10} mb={6} align="center">
      <Flex
        h={8}
        position="relative"
        align="center"
        rounded="full"
        bg="bg.canvas"
        px={4}
        fontSize="xs"
        fontWeight="bold"
        color="fg.default"
        shadow="sm"
        borderWidth="1px"
        borderColor="border.default"
        ml={{ base: 0, md: 4 }}
      >
        {year}
      </Flex>
    </Flex>
  );
}
