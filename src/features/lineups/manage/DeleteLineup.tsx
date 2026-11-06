import { Button, Dialog, Portal, Text } from "@chakra-ui/react";
import type { LineupData } from "@/features/lineups/manage/Lineups";
import { useLineupActions } from "@/features/lineups/manage/useLineupActions";
type Lineup = LineupData["lineups"][number];
export function DeleteLineup({ lineup }: { lineup: Lineup }) {
  const actions = useLineupActions();
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost" minH="44px" color="fg.error">
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
                colorPalette="red"
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
