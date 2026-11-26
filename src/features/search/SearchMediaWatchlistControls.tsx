import { Button, Flex, RadioGroup, Stack, Text } from "@chakra-ui/react";
import type { UnifiedMedia } from "@/server/Media";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import type { AddToWatchlistInsertionPosition } from "@/features/watchlists/add/Mutation";
import { SearchWatchlistSelector } from "./SearchWatchlistSelector";
import { SearchMediaAdditionNotice } from "./SearchMediaAdditionNotice";

interface SearchMediaWatchlistControlsProps {
  mediaType: UnifiedMedia["mediaType"];
  watchlists?: WatchlistSummary[];
  selectedWatchlistId: string;
  insertionPosition: AddToWatchlistInsertionPosition | "";
  requiresInsertionChoice: boolean;
  isAdding: boolean;
  onWatchlistSelect: (watchlistId: string) => void;
  onInsertionPositionChange: (position: AddToWatchlistInsertionPosition) => void;
  onAdd: () => void;
}

const insertionPositionOptions = [
  ["watchlist-insert-beginning", "beginning", "Beginning"],
  ["watchlist-insert-end", "end", "End"],
] as const;

function getAddButtonLabel(isAdding: boolean) {
  if (isAdding) return "Adding...";
  return "Add";
}

function hasNoWatchlists(watchlists: WatchlistSummary[] | undefined) {
  return !watchlists || watchlists.length === 0;
}

function WatchlistSelection({
  watchlists,
  selectedWatchlistId,
  isAdding,
  onWatchlistSelect,
  onAdd,
}: Pick<
  SearchMediaWatchlistControlsProps,
  "watchlists" | "selectedWatchlistId" | "isAdding" | "onWatchlistSelect" | "onAdd"
>) {
  const addButtonLabel = getAddButtonLabel(isAdding);

  return (
    <Flex
      gap={3}
      direction={{ base: "column", sm: "row" }}
      alignItems={{ base: "stretch", sm: "flex-end" }}
    >
      <SearchWatchlistSelector
        watchlists={watchlists}
        selectedWatchlistId={selectedWatchlistId}
        onSelect={onWatchlistSelect}
        disabled={hasNoWatchlists(watchlists) || isAdding}
      />
      <Button
        onClick={onAdd}
        disabled={!selectedWatchlistId || isAdding}
        minW={{ sm: "100px" }}
        colorPalette="pink"
      >
        {addButtonLabel}
      </Button>
    </Flex>
  );
}

function InsertionPositionRadio({
  id,
  value,
  label,
}: {
  id: string;
  value: AddToWatchlistInsertionPosition;
  label: string;
}) {
  return (
    <RadioGroup.Item key={id} value={value}>
      <RadioGroup.ItemHiddenInput />
      <RadioGroup.ItemControl />
      <RadioGroup.ItemText>{label}</RadioGroup.ItemText>
    </RadioGroup.Item>
  );
}

function InsertionPositionOptions() {
  const radioProps = insertionPositionOptions.map(([id, value, label]) => ({
    id,
    value,
    label,
  }));

  return radioProps.map(InsertionPositionRadio);
}

function InsertionPositionChoice({
  visible,
  insertionPosition,
  onInsertionPositionChange,
}: {
  visible: boolean;
  insertionPosition: AddToWatchlistInsertionPosition | "";
  onInsertionPositionChange: (position: AddToWatchlistInsertionPosition) => void;
}) {
  if (!visible) return null;

  return (
    <Stack gap={3} rounded="md" borderWidth="1px" borderColor="border.default" bg="bg.subtle" p={4}>
      <Stack gap={1}>
        <Text fontSize="sm" fontWeight="medium">
          Insert in custom order
        </Text>
        <Text fontSize="xs" color="fg.muted">
          Choose where this item should land in the watchlist&apos;s manual sequence.
        </Text>
      </Stack>
      <RadioGroup.Root
        value={insertionPosition}
        onValueChange={({ value }) => {
          if (value) onInsertionPositionChange(value as AddToWatchlistInsertionPosition);
        }}
        colorPalette="pink"
        display="flex"
        flexDirection="column"
        gap={2}
      >
        <InsertionPositionOptions />
      </RadioGroup.Root>
    </Stack>
  );
}

export function SearchMediaWatchlistControls(props: SearchMediaWatchlistControlsProps) {
  return (
    <Stack gap={4} mt={8}>
      <Text fontSize="sm" fontWeight="medium" color="fg.muted">
        Add to Watchlist
      </Text>
      <WatchlistSelection
        watchlists={props.watchlists}
        selectedWatchlistId={props.selectedWatchlistId}
        isAdding={props.isAdding}
        onWatchlistSelect={props.onWatchlistSelect}
        onAdd={props.onAdd}
      />
      <InsertionPositionChoice
        visible={props.requiresInsertionChoice}
        insertionPosition={props.insertionPosition}
        onInsertionPositionChange={props.onInsertionPositionChange}
      />
      <SearchMediaAdditionNotice mediaType={props.mediaType} />
    </Stack>
  );
}
