import {
  Button,
  Dialog,
  Field,
  Input,
  NativeSelect,
  Portal,
  RadioGroup,
  Stack,
  Text,
} from "@chakra-ui/react";
import { X } from "lucide-react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { MergeWatchlistOrder } from "./MergeWatchlistOrder";

export type MergeDestinationMode = "new" | "existing";

interface MergeWatchlistDestinationProps {
  mode: MergeDestinationMode;
  newName: string;
  targetId: string;
  selectedWatchlists: WatchlistSummary[];
  onModeChange: (mode: MergeDestinationMode) => void;
  onNewNameChange: (name: string) => void;
  onTargetChange: (watchlistId: string) => void;
}

function MergeWatchlistDestination({
  mode,
  newName,
  targetId,
  selectedWatchlists,
  onModeChange,
  onNewNameChange,
  onTargetChange,
}: MergeWatchlistDestinationProps) {
  return (
    <RadioGroup.Root
      value={mode}
      onValueChange={({ value }) => {
        if (value) onModeChange(value as MergeDestinationMode);
      }}
      colorPalette="pink"
      display="flex"
      flexDir="column"
      gap={3}
    >
      <RadioGroup.Item value="new">
        <RadioGroup.ItemHiddenInput />
        <RadioGroup.ItemControl borderWidth="2px" />
        <RadioGroup.ItemText>Create a new watchlist</RadioGroup.ItemText>
      </RadioGroup.Item>
      {mode === "new" ? (
        <Field.Root ml={6} required>
          <Field.Label htmlFor="new-watchlist-name">New watchlist name</Field.Label>
          <Input
            id="new-watchlist-name"
            placeholder="New Watchlist Name"
            value={newName}
            onChange={(event) => onNewNameChange(event.target.value)}
          />
        </Field.Root>
      ) : null}

      <RadioGroup.Item value="existing">
        <RadioGroup.ItemHiddenInput />
        <RadioGroup.ItemControl borderWidth="2px" />
        <RadioGroup.ItemText>Merge into existing watchlist</RadioGroup.ItemText>
      </RadioGroup.Item>
      {mode === "existing" ? (
        <Stack ml={6} gap={2}>
          <Field.Root required>
            <Field.Label htmlFor="merge-target-watchlist">Target watchlist</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                id="merge-target-watchlist"
                value={targetId}
                onChange={(event) => onTargetChange(event.target.value)}
              >
                <option value="">Select target watchlist</option>
                <MergeWatchlistOptions selectedWatchlists={selectedWatchlists} />
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Text fontSize="xs" color="fg.muted">
            The selected list will be kept. Other selected lists will be removed after merging.
          </Text>
        </Stack>
      ) : null}
    </RadioGroup.Root>
  );
}

function MergeWatchlistOptions({ selectedWatchlists }: { selectedWatchlists: WatchlistSummary[] }) {
  const optionProps = selectedWatchlists.map((watchlist) => ({
    optionKey: watchlist.id,
    value: watchlist.id.toString(),
    name: watchlist.name,
  }));

  return optionProps.map(MergeWatchlistOption);
}

function MergeWatchlistOption({
  optionKey,
  value,
  name,
}: {
  optionKey: number;
  value: string;
  name: string;
}) {
  return (
    <option key={optionKey} value={value}>
      {name}
    </option>
  );
}

interface MergeWatchlistDialogContentProps extends MergeWatchlistDestinationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  hasCustomOrderedSelection: boolean;
  isSubmitting: boolean;
  onMove: (watchlistId: number, direction: "up" | "down") => void;
  onCancel: () => void;
  onMerge: () => void;
}

export function MergeWatchlistDialogContent({
  open,
  onOpenChange,
  selectedCount,
  selectedWatchlists,
  hasCustomOrderedSelection,
  isSubmitting,
  onMove,
  onCancel,
  onMerge,
  ...destinationProps
}: MergeWatchlistDialogContentProps) {
  const consequences = mergeConsequences(destinationProps, selectedWatchlists);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open: nextOpen }) => {
        if (!isSubmitting) onOpenChange(nextOpen);
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW={{ base: "calc(100% - 2rem)", sm: "md" }}>
            <Dialog.CloseTrigger aria-label="Close dialog" disabled={isSubmitting}>
              <X size={16} />
            </Dialog.CloseTrigger>
            <Dialog.Header flexDirection="column" alignItems="flex-start" gap={1}>
              <Dialog.Title>Merge watchlists</Dialog.Title>
              <Dialog.Description color="fg.muted">
                Merge {selectedCount} lists. All items will be combined into the target list.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <MergeWatchlistOrder
                  watchlists={selectedWatchlists}
                  hasCustomOrderedSelection={hasCustomOrderedSelection}
                  isSubmitting={isSubmitting}
                  onMove={onMove}
                />
                <Text role="note" fontSize="sm">
                  {consequences}
                </Text>
                <MergeWatchlistDestination
                  {...destinationProps}
                  selectedWatchlists={selectedWatchlists}
                />
              </Stack>
            </Dialog.Body>
            <Dialog.Footer aria-busy={isSubmitting} aria-live="polite">
              <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button colorPalette="pink" onClick={onMerge} disabled={isSubmitting}>
                {isSubmitting ? "Merging..." : "Merge watchlists"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function mergeConsequences(
  destination: Pick<MergeWatchlistDestinationProps, "mode" | "newName" | "targetId">,
  watchlists: WatchlistSummary[],
) {
  if (destination.mode === "new")
    return `Items will be combined into “${destination.newName || "a new watchlist"}”. All selected source watchlists will be removed.`;
  const target = watchlists.find((watchlist) => String(watchlist.id) === destination.targetId);
  return `Items will be combined into “${targetName(target)}”. Other selected watchlists will be removed.`;
}
function targetName(target: WatchlistSummary | undefined) {
  return target?.name || "the selected target";
}
