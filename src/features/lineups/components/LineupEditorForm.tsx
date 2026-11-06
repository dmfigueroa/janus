import { Button, Dialog, Field, Input, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useId } from "react";
import type { useLineupEditor } from "@/features/lineups/manage/useLineupEditor";
import { LineupWatchlistChoices } from "@/features/lineups/components/LineupWatchlistChoices";
export function LineupEditorForm({
  editor,
  hasWatchlists,
  isEdit,
}: {
  editor: ReturnType<typeof useLineupEditor>;
  hasWatchlists: boolean;
  isEdit: boolean;
}) {
  const nameId = useId();
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void editor.save();
      }}
      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <Dialog.Body overflowY="auto">
        <Stack gap={5}>
          <Field.Root required invalid={Boolean(editor.nameError)}>
            <Field.Label htmlFor={nameId}>Name</Field.Label>
            <Input
              id={nameId}
              ref={editor.nameRef}
              value={editor.name}
              disabled={editor.saving}
              placeholder="e.g., Weeknights"
              onChange={(event) => editor.setName(event.target.value)}
            />
            <Field.ErrorText>{editor.nameError}</Field.ErrorText>
          </Field.Root>
          <LineupWatchlistChoices editor={editor} hasWatchlists={hasWatchlists} />
          <EditorError editor={editor} />
        </Stack>
      </Dialog.Body>
      <EditorFooter saving={editor.saving} isEdit={isEdit} />
    </form>
  );
}
function EditorError({ editor }: { editor: ReturnType<typeof useLineupEditor> }) {
  if (!editor.error || editor.nameError) return null;
  return (
    <Text role="alert" color="fg.error">
      {editor.error}
    </Text>
  );
}
function EditorFooter({ saving, isEdit }: { saving: boolean; isEdit: boolean }) {
  const label = isEdit ? "Save changes" : "Create lineup";
  return (
    <Dialog.Footer gap={2}>
      <SavingStatus saving={saving} />
      <Dialog.CloseTrigger asChild>
        <Button variant="ghost" minH="44px" disabled={saving}>
          Cancel
        </Button>
      </Dialog.CloseTrigger>
      <Button type="submit" minH="44px" colorPalette="pink" disabled={saving}>
        {saving ? "Saving…" : label}
      </Button>
    </Dialog.Footer>
  );
}
function SavingStatus({ saving }: { saving: boolean }) {
  return (
    <VisuallyHidden role="status" aria-live="polite">
      {saving ? "Saving lineup" : ""}
    </VisuallyHidden>
  );
}
