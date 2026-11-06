import { Button, Checkbox, Dialog, Field, Input, Portal, Stack, Text } from "@chakra-ui/react";
import type { LineupData } from "@/features/lineups/manage/Lineups";
import { useLineupEditor } from "@/features/lineups/manage/useLineupEditor";
type Lineup = LineupData["lineups"][number];
type Props = { lineup?: Lineup; watchlists: LineupData["watchlists"]; trigger: React.ReactNode };
export function LineupEditor({ lineup, watchlists, trigger }: Props) {
  const editor = useLineupEditor(lineup, watchlists);
  return (
    <Dialog.Root open={editor.open} onOpenChange={({ open }) => editor.setOpen(open)}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{lineup ? "Edit lineup" : "Create lineup"}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <Field.Root required>
                  <Field.Label>Name</Field.Label>
                  <Input
                    value={editor.name}
                    onChange={(event) => editor.setName(event.target.value)}
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Search watchlists</Field.Label>
                  <Input
                    value={editor.search}
                    onChange={(event) => editor.setSearch(event.target.value)}
                  />
                </Field.Root>
                <Stack maxH="48" overflowY="auto" aria-label="Watchlists">
                  <WatchlistChoices editor={editor} />
                </Stack>
                {editor.error && (
                  <Text role="alert" color="fg.error">
                    {editor.error}
                  </Text>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <Button variant="ghost">Cancel</Button>
              </Dialog.CloseTrigger>
              <Button onClick={editor.save} disabled={editor.saving}>
                Save
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
type Choice = {
  id: number;
  name: string;
  checked: boolean;
  toggle: (id: number, checked: boolean) => void;
};
function WatchlistChoices({ editor }: { editor: ReturnType<typeof useLineupEditor> }) {
  const choices = editor.visible.map((item) => ({
    id: item.id,
    name: item.name,
    checked: editor.selected.includes(item.id),
    toggle: editor.toggle,
  }));
  return choices.map(WatchlistChoice);
}
function WatchlistChoice(choice: Choice) {
  return (
    <Checkbox.Root
      key={choice.id}
      checked={choice.checked}
      onCheckedChange={({ checked }) => choice.toggle(choice.id, checked === true)}
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>{choice.name}</Checkbox.Label>
    </Checkbox.Root>
  );
}
