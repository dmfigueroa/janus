import { Box, Button, Checkbox, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { useId } from "react";
import type { useLineupEditor } from "@/features/lineups/manage/useLineupEditor";
type Editor = ReturnType<typeof useLineupEditor>;
type Choice = {
  id: number;
  name: string;
  checked: boolean;
  disabled: boolean;
  toggle: (id: number, checked: boolean) => void;
};
export function LineupWatchlistChoices({
  editor,
  hasWatchlists,
}: {
  editor: Editor;
  hasWatchlists: boolean;
}) {
  const searchId = useId();
  return (
    <Box as="section" aria-label="Watchlists">
      <Flex justify="space-between" align="center" gap={2} wrap="wrap" mb={2}>
        <Text fontWeight="semibold">Watchlists</Text>
        <Text fontSize="sm" color="fg.muted" aria-live="polite">
          {editor.selected.length} selected
        </Text>
      </Flex>
      <Text fontSize="sm" color="fg.muted" mb={3}>
        Paused, completed, and empty lists can be selected. They appear on Watch Now when available.
      </Text>
      <Field.Root>
        <Field.Label htmlFor={searchId}>Search watchlists</Field.Label>
        <Input
          id={searchId}
          value={editor.search}
          disabled={editor.saving}
          placeholder="Search your lists"
          onChange={(event) => editor.setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </Field.Root>
      <Checkbox.Root
        colorPalette="pink"
        checked={editor.selectedOnly}
        disabled={editor.saving}
        onCheckedChange={({ checked }) => editor.setSelectedOnly(checked === true)}
        minH="44px"
        mt={2}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>Show selected only</Checkbox.Label>
      </Checkbox.Root>
      <Stack maxH="48" overflowY="auto" gap={1}>
        <WatchlistChoices editor={editor} />
      </Stack>
      <EmptyChoices editor={editor} hasWatchlists={hasWatchlists} />
      {hasWatchlists && editor.selected.length === 0 && (
        <Text fontSize="sm" color="fg.muted" mt={2}>
          You can add watchlists later.
        </Text>
      )}
    </Box>
  );
}
function WatchlistChoices({ editor }: { editor: Editor }) {
  const choices = editor.visible.map((item) => ({
    id: item.id,
    name: item.name,
    checked: editor.selected.includes(item.id),
    disabled: editor.saving,
    toggle: editor.toggle,
  }));
  return choices.map(WatchlistChoice);
}
function WatchlistChoice(choice: Choice) {
  return (
    <Checkbox.Root
      colorPalette="pink"
      key={choice.id}
      checked={choice.checked}
      disabled={choice.disabled}
      onCheckedChange={({ checked }) => choice.toggle(choice.id, checked === true)}
      minH="44px"
      px={3}
      py={2}
      rounded="md"
      bg={choice.checked ? "bg.subtle" : "transparent"}
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label flex="1" overflowWrap="anywhere">
        {choice.name}
      </Checkbox.Label>
    </Checkbox.Root>
  );
}
function EmptyChoices({ editor, hasWatchlists }: { editor: Editor; hasWatchlists: boolean }) {
  if (!hasWatchlists)
    return (
      <Text fontSize="sm" color="fg.muted" mt={2}>
        No watchlists yet. You can create this lineup now and add lists later.
      </Text>
    );
  if (editor.visible.length) return null;
  return (
    <Flex align="center" gap={2} wrap="wrap" mt={2}>
      <Text fontSize="sm" color="fg.muted">
        No watchlists match your filters.
      </Text>
      <Button
        size="sm"
        variant="ghost"
        minH="44px"
        onClick={() => {
          editor.setSearch("");
          editor.setSelectedOnly(false);
        }}
      >
        Clear filters
      </Button>
    </Flex>
  );
}
