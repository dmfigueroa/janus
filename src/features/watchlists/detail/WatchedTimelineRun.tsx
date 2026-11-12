import { useId, useState } from "react";
import { Box, Button } from "@chakra-ui/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { WatchlistItem } from "@/db/Schema";
import { ReorderableTimelineRow } from "../components/ReorderableTimelineRow";

export function buildTimelineRuns(items: WatchlistItem[], collapseWatched: boolean) {
  return items.reduce<Array<{ hidden: boolean; items: WatchlistItem[] }>>((runs, item) => {
    const hidden = [collapseWatched, Boolean(item.isWatched)].every(Boolean);
    const previous = runs.at(-1);
    if ([hidden, previous?.hidden].every(Boolean)) {
      previous!.items.push(item);
    } else {
      runs.push({ hidden, items: [item] });
    }
    return runs;
  }, []);
}

type RowProps = React.ComponentProps<typeof ReorderableTimelineRow>;

export function WatchedTimelineRun({
  run,
  reorderEnabled,
  ...props
}: Omit<RowProps, "item" | "showHandle"> & {
  run: ReturnType<typeof buildTimelineRuns>[number];
  reorderEnabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const visible = [!run.hidden, expanded].some(Boolean);

  const rowProps = run.items.map((item) => ({
    ...props,
    item,
    showHandle: props.showHandleSlot && reorderEnabled,
    key: item.id,
  }));
  return (
    <Box>
      {run.hidden ? (
        <WatchedRunDisclosure
          count={run.items.length}
          expanded={expanded}
          contentId={contentId}
          onToggle={() => setExpanded(!expanded)}
        />
      ) : null}
      <Box id={contentId} hidden={!visible}>
        {visible ? <TimelineRunItems rows={rowProps} /> : null}
      </Box>
    </Box>
  );
}

function TimelineRunItem({ key, ...props }: RowProps & { key: number }) {
  return <ReorderableTimelineRow key={key} {...props} />;
}

function TimelineRunItems({ rows }: { rows: Array<RowProps & { key: number }> }) {
  return rows.map(TimelineRunItem);
}
function WatchedRunDisclosure({
  count,
  expanded,
  contentId,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  contentId: string;
  onToggle: () => void;
}) {
  const label = count === 1 ? "1 watched item" : `${count} watched items`;
  return (
    <Button
      variant="ghost"
      color="fg.muted"
      size="sm"
      minH="44px"
      aria-expanded={expanded}
      aria-controls={contentId}
      onClick={onToggle}
    >
      <WatchedRunChevron expanded={expanded} />
      {label}
      {expanded ? " — collapse" : " hidden"}
    </Button>
  );
}
function WatchedRunChevron({ expanded }: { expanded: boolean }) {
  return expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />;
}
