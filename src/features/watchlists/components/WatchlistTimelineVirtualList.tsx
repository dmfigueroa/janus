import { Box } from "@chakra-ui/react";
import { defaultRangeExtractor, useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { ReleaseTimelineDecorations } from "./ReleaseTimelineDecorations";
import { TimelineBlockSlots } from "./TimelineBlockSlot";
import { TimelineYearHeading } from "./TimelineYearHeading";

import type { WatchlistTimelineBlock } from "./WatchlistTimeline.model";

const ROW_HEIGHT_ESTIMATE = 136;
const OVERSCAN_ROWS = 8;
const INITIAL_VIEWPORT = { width: 1024, height: 900 };

type WatchlistTimelineVirtualListProps = {
  blocks: WatchlistTimelineBlock[];
  itemOrderMode: WatchlistItemOrderMode;
  showHandleSlot: boolean;
  showHandle: boolean;
  interactionDisabled: boolean;
  onToggleRun: (runKey: string) => void;
};

export function WatchlistTimelineVirtualList(props: WatchlistTimelineVirtualListProps) {
  const { blocks, itemOrderMode } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    const listElement = listRef.current;
    if (!listElement) return;

    const measureScrollMargin = () => {
      setScrollMargin(listElement.getBoundingClientRect().top + window.scrollY);
    };
    measureScrollMargin();
    window.addEventListener("resize", measureScrollMargin);
    return () => window.removeEventListener("resize", measureScrollMargin);
  }, [blocks.length]);

  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) =>
      keepFocusedIndex(defaultRangeExtractor(range), focusedIndex),
    [focusedIndex],
  );

  const virtualizer = useWindowVirtualizer({
    count: blocks.length,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: OVERSCAN_ROWS,
    scrollMargin,
    rangeExtractor,
    getItemKey: (index) => blocks[index]?.key ?? index,
    // Render the first screen during SSR. The measurement pass replaces these
    // estimates once the browser reports real row heights.
    initialRect: INITIAL_VIEWPORT,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const pinnedYear = getPinnedYear({
    blocks,
    virtualItems,
    getVirtualItemForOffset: virtualizer.getVirtualItemForOffset,
    itemOrderMode,
  });
  const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest("[data-index]");
    setFocusedIndex(row ? Number(row.getAttribute("data-index")) : null);
  };
  const slotProps = virtualItems.map((virtualItem) => ({
    key: virtualItem.key,
    index: virtualItem.index,
    start: virtualItem.start - scrollMargin,
    block: blocks[virtualItem.index]!,
    measureElement: virtualizer.measureElement,
    itemOrderMode,
    showHandleSlot: props.showHandleSlot,
    showHandle: props.showHandle,
    interactionDisabled: props.interactionDisabled,
    onToggleRun: props.onToggleRun,
  }));

  return (
    <Box position="relative" pl={{ base: 6, md: 0 }} overflowAnchor="none">
      <ReleaseTimelineDecorations itemOrderMode={itemOrderMode} />
      <PinnedYearHeading year={pinnedYear} />
      <div
        ref={listRef}
        onFocus={handleFocus}
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
      >
        <TimelineBlockSlots slotProps={slotProps} />
      </div>
    </Box>
  );
}

function PinnedYearHeading({ year }: { year: string | null }) {
  if (!year) return null;

  return (
    <Box position="sticky" top="var(--watchlist-header-height, 0px)" zIndex={10} h={0}>
      <TimelineYearHeading year={year} />
    </Box>
  );
}

/**
 * Keeps the focused row mounted. Virtual rows unmount when they leave the overscan window,
 * and losing the focused element drops keyboard position mid-list.
 */
function keepFocusedIndex(range: number[], focusedIndex: number | null) {
  if (focusedIndex === null || range.includes(focusedIndex)) {
    return range;
  }
  return [...range, focusedIndex].sort((left, right) => left - right);
}

function getPinnedYear({
  blocks,
  virtualItems,
  getVirtualItemForOffset,
  itemOrderMode,
}: {
  blocks: WatchlistTimelineBlock[];
  virtualItems: Array<{ index: number }>;
  getVirtualItemForOffset: (offset: number) => { index: number } | undefined;
  itemOrderMode: WatchlistItemOrderMode;
}) {
  if (itemOrderMode !== "release") return null;
  return getYearForTopRow(blocks, virtualItems, getVirtualItemForOffset);
}

function getYearForTopRow(
  blocks: WatchlistTimelineBlock[],
  virtualItems: Array<{ index: number }>,
  getVirtualItemForOffset: (offset: number) => { index: number } | undefined,
) {
  const block = findViewportTopBlock(blocks, getVirtualItemForOffset);
  if (!isRowBlock(block)) return null;
  return hiddenInlineHeadingYear(blocks, virtualItems, block.year);
}

function hiddenInlineHeadingYear(
  blocks: WatchlistTimelineBlock[],
  virtualItems: Array<{ index: number }>,
  year: string,
) {
  return isInlineYearHeadingRendered(blocks, virtualItems, year) ? null : year;
}

function findViewportTopBlock(
  blocks: WatchlistTimelineBlock[],
  getVirtualItemForOffset: (offset: number) => { index: number } | undefined,
) {
  const index = readViewportTopIndex(getVirtualItemForOffset);
  return index === null ? null : (blocks[index] ?? null);
}

function readViewportTopIndex(
  getVirtualItemForOffset: (offset: number) => { index: number } | undefined,
) {
  if (typeof window === "undefined") return null;
  const item = getVirtualItemForOffset(window.scrollY);
  return item ? item.index : null;
}

function isRowBlock(
  block: WatchlistTimelineBlock | null,
): block is Extract<WatchlistTimelineBlock, { kind: "item" | "disclosure" }> {
  return Boolean(block) && block?.kind !== "year";
}

function isInlineYearHeadingRendered(
  blocks: WatchlistTimelineBlock[],
  virtualItems: Array<{ index: number }>,
  year: string,
) {
  return virtualItems.some((item) => isYearHeadingFor(blocks[item.index], year));
}

function isYearHeadingFor(block: WatchlistTimelineBlock | undefined, year: string) {
  return block?.kind === "year" && block.year === year;
}
