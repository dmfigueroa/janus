import { Combobox, createListCollection, IconButton, Portal } from "@chakra-ui/react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { SearchWatchlistSelectorItem } from "./SearchWatchlistSelector";

function handleSelectorValue(
  value: string | undefined,
  selectedWatchlistId: string,
  onClear: () => void,
  onCreate: (name: string) => void,
  onSelect: (id: string) => void,
) {
  if (!value) {
    onClear();
    return;
  }
  if (value.startsWith("create:")) {
    onCreate(value.slice("create:".length));
    return;
  }
  onSelect(getSelectedWatchlistId(value, selectedWatchlistId));
}

function getSelectedWatchlistId(value: string, selectedWatchlistId: string) {
  if (value === selectedWatchlistId) return "";
  return value;
}

function getComboboxValue(selectedWatchlistId: string) {
  if (selectedWatchlistId) return [selectedWatchlistId];
  return [];
}

function getComboboxPlaceholder(selectedWatchlistName: string | undefined) {
  if (selectedWatchlistName) return selectedWatchlistName;
  return "Select a watchlist...";
}

function getComboboxDisabled(disabled: boolean, isCreating: boolean) {
  return disabled || isCreating;
}

function CreateWatchlistItem({ item }: { item: SearchWatchlistSelectorItem }) {
  return (
    <Combobox.Item key={item.value} item={item}>
      <Plus size={16} aria-hidden="true" />
      <Combobox.ItemText>{item.label}</Combobox.ItemText>
    </Combobox.Item>
  );
}

function ExistingWatchlistItem({ item }: { item: SearchWatchlistSelectorItem }) {
  return (
    <Combobox.Item key={item.value} item={item}>
      <Combobox.ItemText>{item.label}</Combobox.ItemText>
      <Combobox.ItemIndicator>
        <Check size={16} />
      </Combobox.ItemIndicator>
    </Combobox.Item>
  );
}

function SearchWatchlistItem({ item }: { item: SearchWatchlistSelectorItem }) {
  if (item.isCreateOption) return <CreateWatchlistItem key={item.value} item={item} />;
  return <ExistingWatchlistItem key={item.value} item={item} />;
}

function SearchWatchlistItems({ items }: { items: SearchWatchlistSelectorItem[] }) {
  const itemProps = items.map((item) => ({ item }));
  return itemProps.map(SearchWatchlistItem);
}

export function SearchWatchlistCombobox({
  items,
  selectedWatchlistId,
  selectedWatchlistName,
  disabled,
  isCreating,
  onClear,
  onCreate,
  onSelect,
  onInputValueChange,
}: {
  items: SearchWatchlistSelectorItem[];
  selectedWatchlistId: string;
  selectedWatchlistName: string | undefined;
  disabled: boolean;
  isCreating: boolean;
  onClear: () => void;
  onCreate: (name: string) => void;
  onSelect: (id: string) => void;
  onInputValueChange: (value: string) => void;
}) {
  const collection = createListCollection({ items });

  return (
    <Combobox.Root
      collection={collection}
      value={getComboboxValue(selectedWatchlistId)}
      onValueChange={({ value }) =>
        handleSelectorValue(value[0], selectedWatchlistId, onClear, onCreate, onSelect)
      }
      onInputValueChange={({ inputValue }) => onInputValueChange(inputValue)}
      disabled={getComboboxDisabled(disabled, isCreating)}
      width="full"
      positioning={{ sameWidth: true }}
    >
      <Combobox.Label>Watchlist</Combobox.Label>
      <Combobox.Control>
        <Combobox.Input
          aria-label="Watchlist"
          placeholder={getComboboxPlaceholder(selectedWatchlistName)}
        />
        <Combobox.IndicatorGroup>
          <Combobox.ClearTrigger aria-label="Clear watchlist" />
          <Combobox.Trigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="Open watchlist list">
              <ChevronDown size={16} />
            </IconButton>
          </Combobox.Trigger>
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.Empty>No watchlist found.</Combobox.Empty>
            <SearchWatchlistItems items={collection.items} />
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
