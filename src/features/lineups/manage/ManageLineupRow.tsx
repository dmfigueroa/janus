import {
  Button,
  Box,
  Checkbox,
  Flex,
  Grid,
  IconButton,
  Link as ChakraLink,
  Text,
  VisuallyHidden,
} from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { LineupData } from "@/features/lineups/manage/Lineups";
import { DeleteLineup } from "@/features/lineups/manage/DeleteLineup";
import { LineupEditor } from "@/features/lineups/components/LineupEditor";
import { useLineupActions } from "@/features/lineups/manage/useLineupActions";

type Lineup = LineupData["lineups"][number];
export function lineupKey(lineup: Lineup) {
  return lineup.reference.kind === "system"
    ? `system-${lineup.reference.key}`
    : `custom-${lineup.reference.id}`;
}
export function LineupRow({
  lineup,
  watchlists,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  lineup: Lineup;
  watchlists: LineupData["watchlists"];
  onMove: (offset: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const sortable = useSortable({ id: lineupKey(lineup) });
  const actions = useLineupActions();
  return (
    <Grid
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      p={3}
      borderWidth="1px"
      borderColor="border.default"
      rounded="md"
      templateColumns="44px minmax(0, 1fr) auto"
      columnGap={2}
      rowGap={1}
      alignItems="center"
      bg="bg.surface"
    >
      <IconButton
        aria-label={`Drag ${lineup.name}`}
        variant="ghost"
        minW="44px"
        minH="44px"
        touchAction="none"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical />
      </IconButton>
      <Box minW={0}>
        <LineupName lineup={lineup} />
        <LineupDescription lineup={lineup} />
      </Box>
      <Checkbox.Root
        checked={lineup.enabled}
        disabled={actions.saving}
        minH="44px"
        onCheckedChange={({ checked }) =>
          void actions.submit({
            action: "enable",
            reference: lineup.reference,
            enabled: checked === true,
          })
        }
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label fontSize="sm" color="fg.muted">
          Show <VisuallyHidden>{lineup.name} on Watch Now</VisuallyHidden>
        </Checkbox.Label>
      </Checkbox.Root>
      <Flex gridColumn="2 / -1" align="center" gap={1} wrap="wrap">
        <IconButton
          aria-label={`Move ${lineup.name} up`}
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          variant="ghost"
          minW="44px"
          minH="44px"
        >
          <ArrowUp />
        </IconButton>
        <IconButton
          aria-label={`Move ${lineup.name} down`}
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          variant="ghost"
          minW="44px"
          minH="44px"
        >
          <ArrowDown />
        </IconButton>
        <CustomActions lineup={lineup} watchlists={watchlists} />
      </Flex>
      {actions.error && (
        <Text role="alert" color="fg.error" gridColumn="1 / -1">
          {actions.error}
        </Text>
      )}
    </Grid>
  );
}

function LineupName({ lineup }: { lineup: Lineup }) {
  if (lineup.reference.kind === "system")
    return (
      <Text fontWeight="semibold" overflowWrap="anywhere">
        {lineup.name}
      </Text>
    );
  return (
    <ChakraLink
      asChild
      fontWeight="semibold"
      overflowWrap="anywhere"
      textDecoration="underline"
      textUnderlineOffset="3px"
    >
      <Link to="/rotations/custom/$lineupId" params={{ lineupId: String(lineup.reference.id) }}>
        {lineup.name}
      </Link>
    </ChakraLink>
  );
}
function LineupDescription({ lineup }: { lineup: Lineup }) {
  if (lineup.reference.kind === "system")
    return (
      <Text fontSize="xs" color="fg.muted">
        Automatic
      </Text>
    );
  const count = lineup.configuredCount ?? 0;
  const label = listLabel(count);
  return (
    <Text fontSize="xs" color="fg.muted">
      Custom · {count} {label} · {lineup.eligibleCount} available now
    </Text>
  );
}
function CustomActions({
  lineup,
  watchlists,
}: {
  lineup: Lineup;
  watchlists: LineupData["watchlists"];
}) {
  if (lineup.reference.kind !== "custom") return null;
  return (
    <>
      <LineupEditor
        lineup={lineup}
        watchlists={watchlists}
        trigger={
          <Button size="sm" variant="outline" minH="44px">
            Edit
          </Button>
        }
      />
      <DeleteLineup lineup={lineup} />
    </>
  );
}

function listLabel(count: number) {
  return count === 1 ? "list" : "lists";
}
