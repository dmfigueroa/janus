import {
  Button,
  Checkbox,
  Dialog,
  Flex,
  IconButton,
  Link as ChakraLink,
  Portal,
  Text,
} from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { LineupData } from "@/features/lineups/manage/Lineups";
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
    <Flex
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      p={3}
      borderWidth="1px"
      borderColor="border.default"
      rounded="md"
      gap={2}
      align="center"
      wrap="wrap"
    >
      <IconButton
        aria-label={`Drag ${lineup.name}`}
        variant="ghost"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical />
      </IconButton>
      <Checkbox.Root
        checked={lineup.enabled}
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
        <Checkbox.Label>Enabled</Checkbox.Label>
      </Checkbox.Root>
      <LineupName lineup={lineup} />
      <Flex flex="1" />
      <IconButton
        aria-label={`Move ${lineup.name} up`}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
        variant="ghost"
      >
        <ArrowUp />
      </IconButton>
      <IconButton
        aria-label={`Move ${lineup.name} down`}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
        variant="ghost"
      >
        <ArrowDown />
      </IconButton>
      <CustomActions lineup={lineup} watchlists={watchlists} />
      {actions.error && (
        <Text role="alert" color="fg.error">
          {actions.error}
        </Text>
      )}
    </Flex>
  );
}
function DeleteLineup({ lineup }: { lineup: Lineup }) {
  const actions = useLineupActions();
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="outline">
          Delete
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Delete {lineup.name}?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>Watchlists will not be deleted.</Text>
              {actions.error && <Text role="alert">{actions.error}</Text>}
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <Button variant="ghost">Cancel</Button>
              </Dialog.CloseTrigger>
              <Button
                disabled={actions.saving}
                onClick={() =>
                  void actions.submit({ action: "delete", reference: lineup.reference })
                }
              >
                Delete lineup
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function LineupName({ lineup }: { lineup: Lineup }) {
  if (lineup.reference.kind === "system") return <Text>{lineup.name}</Text>;
  return (
    <ChakraLink asChild>
      <Link to="/rotations/custom/$lineupId" params={{ lineupId: String(lineup.reference.id) }}>
        {lineup.name}
      </Link>
    </ChakraLink>
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
        trigger={<Button size="sm">Edit</Button>}
      />
      <DeleteLineup lineup={lineup} />
    </>
  );
}
