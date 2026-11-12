import { Box, Flex } from "@chakra-ui/react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import type { WatchlistTimelineGroup } from "./WatchlistTimeline.model";
import { WatchedTimelineRun, buildTimelineRuns } from "../detail/WatchedTimelineRun";

export function WatchlistTimelineGroupSection({
  group,
  unwatchedOnly,
  itemOrderMode,
  interactionDisabled,
  reorderEnabled,
  showHandleSlot,
}: {
  group: WatchlistTimelineGroup;
  unwatchedOnly: boolean;
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
            unwatchedOnly={unwatchedOnly}
            itemOrderMode={itemOrderMode}
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
  unwatchedOnly,
  itemOrderMode,
  showHandleSlot,
  reorderEnabled,
  interactionDisabled,
}: {
  items: WatchlistItem[];
  unwatchedOnly: boolean;
  itemOrderMode: WatchlistItemOrderMode;
  showHandleSlot: boolean;
  reorderEnabled: boolean;
  interactionDisabled: boolean;
}) {
  const runs = buildTimelineRuns(items, unwatchedOnly);
  const runProps = runs.map((run) => ({
    key: run.items[0].id,
    run,
    itemOrderMode,
    showHandleSlot,
    reorderEnabled,
    interactionDisabled,
  }));
  return runProps.map(TimelineRun);
}

function TimelineRun({
  key,
  run,
  ...props
}: React.ComponentProps<typeof WatchedTimelineRun> & { key: number }) {
  return <WatchedTimelineRun key={key} run={run} {...props} />;
}

function TimelineYearHeader({ year }: { year: string }) {
  return (
    <Flex
      position="sticky"
      top="var(--watchlist-header-height, 0px)"
      zIndex={10}
      mb={2}
      bg="bg.canvas"
      py={2}
      align="center"
    >
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
        borderWidth="1px"
        borderColor="border.default"
        ml={{ base: 0, md: 4 }}
      >
        {year}
      </Flex>
    </Flex>
  );
}
