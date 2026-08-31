import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Box, Flex, Text } from "@chakra-ui/react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import type { ReorderIntent } from "@/features/watchlists/detail/Reorder";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useMemo } from "react";
import { DragOverlayTimelineRow } from "./ReorderableTimelineRow";
import { WatchlistTimelineGroupSection } from "./WatchlistTimelineGroup";
import { useWatchlistTimelineReorder } from "./useWatchlistTimelineReorder";
import { WatchlistTimelineEndcap } from "./WatchlistTimelineEndcap";
import {
  buildWatchlistTimelineGroups,
  type WatchlistTimelineGroup,
} from "./WatchlistTimeline.model";

interface WatchlistTimelineProps {
  items: WatchlistItem[];
  activeFilters: WatchlistDetailQueryFilters;
  itemOrderMode: WatchlistItemOrderMode;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  canReorder?: boolean;
  interactionDisabled?: boolean;
  reorderFailed?: boolean;
  onReorder?: (intent: ReorderIntent) => void;
}

export function WatchlistTimeline(props: WatchlistTimelineProps) {
  const { items, itemOrderMode, onLoadMore, onReorder } = props;
  const reorder = useWatchlistTimelineReorder({
    items,
    itemOrderMode,
    canReorder: Boolean(props.canReorder),
    reorderFailed: Boolean(props.reorderFailed),
    onReorder,
  });
  const groups = useMemo(
    () => buildWatchlistTimelineGroups(reorder.displayedItems, itemOrderMode),
    [reorder.displayedItems, itemOrderMode],
  );
  const { ref } = useIntersectionObserver({
    onIntersect: getLoadMoreHandler(Boolean(props.interactionDisabled), onLoadMore),
    enabled: isLoadMoreEnabled(props),
    rootMargin: "100px",
  });

  return <WatchlistTimelineContent props={props} reorder={reorder} groups={groups} ref={ref} />;
}

const getLoadMoreHandler = (interactionDisabled: boolean, onLoadMore: (() => void) | undefined) =>
  interactionDisabled ? undefined : onLoadMore;

function isLoadMoreEnabled({
  onLoadMore,
  hasMore,
  isLoadingMore,
  interactionDisabled,
}: Pick<
  WatchlistTimelineProps,
  "onLoadMore" | "hasMore" | "isLoadingMore" | "interactionDisabled"
>) {
  if (!onLoadMore) return false;
  if (!hasMore) return false;
  return isTimelineInteractionReady(isLoadingMore, interactionDisabled);
}

const isTimelineInteractionReady = (isLoadingMore?: boolean, interactionDisabled?: boolean) =>
  !isLoadingMore && !interactionDisabled;

function WatchlistTimelineContent({
  props,
  reorder,
  groups,
  ref,
}: {
  props: WatchlistTimelineProps;
  reorder: ReturnType<typeof useWatchlistTimelineReorder>;
  groups: WatchlistTimelineGroup[];
  ref: ReturnType<typeof useIntersectionObserver>["ref"];
}) {
  if (props.items.length === 0) return <EmptyWatchlistState />;
  const showHandleSlot = props.itemOrderMode === "custom";

  return (
    <DndContext
      sensors={reorder.sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={reorder.handleDragStart}
      onDragCancel={reorder.handleDragCancel}
      onDragEnd={reorder.handleDragEnd}
    >
      <DragOverlay>
        {reorder.activeItem ? (
          <DragOverlayTimelineRow
            item={reorder.activeItem}
            interactionDisabled={Boolean(props.interactionDisabled)}
          />
        ) : null}
      </DragOverlay>

      <Box position="relative" pl={{ base: 6, md: 0 }} overflowAnchor="none">
        <ReleaseTimelineDecorations itemOrderMode={props.itemOrderMode} />
        <Box>
          <TimelineGroups
            groups={groups}
            props={props}
            reorderEnabled={reorder.reorderEnabled}
            showHandleSlot={showHandleSlot}
          />
        </Box>
        <WatchlistTimelineEndcap hasMore={props.hasMore} sentinelRef={ref} />
      </Box>
    </DndContext>
  );
}

function TimelineGroups({
  groups,
  props,
  reorderEnabled,
  showHandleSlot,
}: {
  groups: WatchlistTimelineGroup[];
  props: WatchlistTimelineProps;
  reorderEnabled: boolean;
  showHandleSlot: boolean;
}) {
  const groupProps = groups.map((group) => ({
    key: group.year,
    group,
    activeFilters: props.activeFilters,
    itemOrderMode: props.itemOrderMode,
    interactionDisabled: Boolean(props.interactionDisabled),
    reorderEnabled,
    showHandleSlot,
  }));
  return groupProps.map(WatchlistTimelineGroupSection);
}

function EmptyWatchlistState() {
  return (
    <Flex
      h={64}
      direction="column"
      align="center"
      justify="center"
      textAlign="center"
      color="fg.muted"
      opacity={0.6}
    >
      <Text>No items in this watchlist yet.</Text>
      <Text fontSize="sm">Add movies and shows from the Search page.</Text>
    </Flex>
  );
}

function ReleaseTimelineDecorations({ itemOrderMode }: { itemOrderMode: WatchlistItemOrderMode }) {
  if (itemOrderMode !== "release") {
    return null;
  }

  return (
    <>
      <Box
        position="absolute"
        bottom={12}
        left="26px"
        top={6}
        w="2px"
        bg="border.default"
        display={{ base: "block", md: "none" }}
      />
      <Box
        position="absolute"
        bottom={12}
        left={8}
        top={0}
        w="2px"
        bg="border.default"
        display={{ base: "none", md: "block" }}
      />
    </>
  );
}
