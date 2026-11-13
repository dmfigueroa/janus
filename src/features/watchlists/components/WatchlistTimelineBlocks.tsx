import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { ReorderableTimelineRow } from "./ReorderableTimelineRow";
import { TimelineYearHeading } from "./TimelineYearHeading";
import { WatchedRunDisclosure } from "./WatchedRunDisclosure";
import type { WatchlistTimelineBlock } from "./WatchlistTimeline.model";

type BlockContentProps = {
  block: WatchlistTimelineBlock;
  itemOrderMode: WatchlistItemOrderMode;
  showHandleSlot: boolean;
  showHandle: boolean;
  interactionDisabled: boolean;
  onToggleRun: (runKey: string) => void;
};

export function WatchlistTimelineBlockContent(props: BlockContentProps) {
  const { block } = props;
  if (block.kind === "year") {
    return <TimelineYearHeading year={block.year} />;
  }

  if (block.kind === "disclosure") {
    return <WatchedRunDisclosureBlock block={block} onToggleRun={props.onToggleRun} />;
  }

  return <ItemBlock props={props} item={block.item} />;
}

function ItemBlock({
  props,
  item,
}: {
  props: BlockContentProps;
  item: Extract<WatchlistTimelineBlock, { kind: "item" }>["item"];
}) {
  return (
    <ReorderableTimelineRow
      item={item}
      showHandleSlot={props.showHandleSlot}
      showHandle={props.showHandle}
      interactionDisabled={props.interactionDisabled}
      itemOrderMode={props.itemOrderMode}
    />
  );
}

function WatchedRunDisclosureBlock({
  block,
  onToggleRun,
}: {
  block: Extract<WatchlistTimelineBlock, { kind: "disclosure" }>;
  onToggleRun: (runKey: string) => void;
}) {
  return (
    <WatchedRunDisclosure
      count={block.count}
      expanded={block.expanded}
      onToggle={() => onToggleRun(block.runKey)}
    />
  );
}
