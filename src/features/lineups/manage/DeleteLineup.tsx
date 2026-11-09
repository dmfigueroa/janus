import { Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { useRef, useState } from "react";
import type { LineupData } from "@/features/lineups/manage/Lineups";
import { useLineupActions } from "@/features/lineups/manage/useLineupActions";
type Lineup = LineupData["lineups"][number];
export function DeleteLineup({ lineup }: { lineup: Lineup }) {
  const actions = useLineupActions();
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root
      role="alertdialog"
      open={open}
      initialFocusEl={() => cancelRef.current}
      onOpenChange={({ open }) => {
        if (!actions.saving) setOpen(open);
      }}
    >
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
              <Dialog.Description>Watchlists will not be deleted.</Dialog.Description>
              {actions.error && <Text role="alert">{actions.error}</Text>}
            </Dialog.Body>
            <Dialog.Footer aria-busy={actions.saving} aria-live="polite">
              <Dialog.CloseTrigger asChild>
                <Button ref={cancelRef} disabled={actions.saving} variant="ghost">
                  Cancel
                </Button>
              </Dialog.CloseTrigger>
              <Button
                colorPalette="red"
                disabled={actions.saving}
                onClick={() =>
                  void actions
                    .submit({ action: "delete", reference: lineup.reference })
                    .then((success) => {
                      if (success) setOpen(false);
                    })
                }
              >
                {actions.saving ? "Deleting…" : "Delete lineup"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
