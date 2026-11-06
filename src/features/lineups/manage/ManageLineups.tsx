import { Box, Button, Container, Heading, Stack, Text } from "@chakra-ui/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { LineupData } from "@/features/lineups/manage/Lineups";
import { LineupEditor } from "@/features/lineups/components/LineupEditor";
import { LineupRow, lineupKey } from "@/features/lineups/manage/ManageLineupRow";
import { useLineupActions } from "@/features/lineups/manage/useLineupActions";
import { useState } from "react";
import { Plus } from "lucide-react";

export function ManageLineups({ data }: { data: LineupData }) {
  const actions = useLineupActions();
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  async function move(from: number, to: number) {
    if (!validMove(from, to, data.lineups.length)) return;
    setAnnouncement("");
    const saved = await actions.submit({
      action: "reorder",
      references: arrayMove(data.lineups, from, to).map((lineup) => lineup.reference),
    });
    if (saved)
      setAnnouncement(
        `${data.lineups[from].name} moved to position ${to + 1} of ${data.lineups.length}.`,
      );
  }
  function dragEnd(event: DragEndEvent) {
    if (!event.over) return;
    void move(
      data.lineups.findIndex((lineup) => lineupKey(lineup) === event.active.id),
      data.lineups.findIndex((lineup) => lineupKey(lineup) === event.over?.id),
    );
  }
  return (
    <Container maxW="4xl" py={8} pb={24}>
      <Heading as="h1" size="3xl" fontWeight="extrabold" letterSpacing="tight" mb={2}>
        Manage Lineups
      </Heading>
      <Text color="fg.muted" mb={4}>
        Choose what appears on Watch Now. Drag or use the arrows to reorder. Changes save
        automatically.
      </Text>
      <LineupEditor
        watchlists={data.watchlists}
        trigger={
          <Button mb={5} minH="44px" colorPalette="pink">
            <Plus size={18} aria-hidden="true" /> Create lineup
          </Button>
        }
      />
      <Text srOnly aria-live="polite" role="status">
        {announcement}
      </Text>
      {actions.error && (
        <Text color="fg.error" role="alert">
          {actions.error}
        </Text>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
        <SortableContext items={data.lineups.map(lineupKey)} strategy={verticalListSortingStrategy}>
          <Stack as="ul" gap={2} listStyle="none" p={0}>
            <LineupRows lineups={data.lineups} watchlists={data.watchlists} move={move} />
          </Stack>
        </SortableContext>
      </DndContext>
    </Container>
  );
}

function validMove(from: number, to: number, count: number) {
  return from !== to && inRange(from, count) && inRange(to, count);
}
function inRange(index: number, count: number) {
  return index >= 0 && index < count;
}

type RowProps = {
  lineup: LineupData["lineups"][number];
  watchlists: LineupData["watchlists"];
  index: number;
  count: number;
  move: (from: number, to: number) => Promise<void>;
};
function LineupRows({
  lineups,
  watchlists,
  move,
}: {
  lineups: LineupData["lineups"];
  watchlists: LineupData["watchlists"];
  move: RowProps["move"];
}) {
  const rows = lineups.map((lineup, index) => ({
    lineup,
    index,
    count: lineups.length,
    watchlists,
    move,
  }));
  return rows.map(ManageRow);
}
function ManageRow({ lineup, index, count, watchlists, move }: RowProps) {
  return (
    <Box as="li" key={lineupKey(lineup)}>
      <LineupRow
        lineup={lineup}
        watchlists={watchlists}
        onMove={(offset) => void move(index, index + offset)}
        canMoveUp={index > 0}
        canMoveDown={index < count - 1}
      />
    </Box>
  );
}
