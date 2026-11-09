import { Dialog, Portal } from "@chakra-ui/react";
import type { LineupData } from "@/features/lineups/manage/Lineups";
import { useLineupEditor } from "@/features/lineups/manage/useLineupEditor";
import { LineupEditorForm } from "@/features/lineups/components/LineupEditorForm";
type Lineup = LineupData["lineups"][number];
type Props = { lineup?: Lineup; watchlists: LineupData["watchlists"]; trigger: React.ReactNode };
export function LineupEditor({ lineup, watchlists, trigger }: Props) {
  const editor = useLineupEditor(lineup, watchlists);
  return (
    <Dialog.Root
      open={editor.open}
      onOpenChange={({ open }) => {
        if (!editor.saving) editor.setOpen(open);
      }}
      initialFocusEl={() => editor.nameRef.current}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxH="calc(100dvh - 2rem)" display="flex" flexDirection="column" mx={3}>
            <Dialog.Header>
              <Dialog.Title>{lineup ? "Edit lineup" : "Create lineup"}</Dialog.Title>
            </Dialog.Header>
            <LineupEditorForm
              editor={editor}
              hasWatchlists={watchlists.length > 0}
              isEdit={Boolean(lineup)}
            />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
