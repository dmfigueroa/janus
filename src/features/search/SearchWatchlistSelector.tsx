import { useMemo, useState } from "react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { SearchWatchlistCombobox } from "./SearchWatchlistCombobox";
import { useCreateSearchWatchlist } from "./useCreateSearchWatchlist";

interface SearchWatchlistSelectorProps {
  watchlists: WatchlistSummary[] | undefined;
  selectedWatchlistId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export interface SearchWatchlistSelectorItem {
  label: string;
  value: string;
  isCreateOption?: boolean;
}

type SelectorItem = SearchWatchlistSelectorItem;

function getSelectedWatchlistName(
  watchlists: WatchlistSummary[] | undefined,
  selectedWatchlistId: string,
  createdWatchlist: SelectorItem | null,
) {
  const selectedName = new Map(
    (watchlists ?? []).map((watchlist) => [watchlist.id.toString(), watchlist.name]),
  ).get(selectedWatchlistId);
  if (selectedName) return selectedName;
  return getCreatedWatchlistName(createdWatchlist, selectedWatchlistId);
}

function getCreatedWatchlistName(
  createdWatchlist: SelectorItem | null,
  selectedWatchlistId: string,
) {
  if (!createdWatchlist) return undefined;
  if (createdWatchlist.value !== selectedWatchlistId) return undefined;
  return createdWatchlist.label;
}

function getExistingSelectorItems(watchlists: WatchlistSummary[] | undefined) {
  return (
    watchlists?.map((watchlist) => ({
      label: watchlist.name,
      value: watchlist.id.toString(),
    })) ?? []
  );
}

function filterExistingSelectorItems(existingItems: SelectorItem[], inputValue: string) {
  const normalizedInput = inputValue.trim().toLowerCase();
  if (!normalizedInput) return existingItems;
  return existingItems.filter((item) => item.label.toLowerCase().includes(normalizedInput));
}

function getCreatedSelectorItems(
  createdWatchlist: SelectorItem | null,
  existingItems: SelectorItem[],
) {
  if (!createdWatchlist) return [];
  if (existingItems.some((item) => item.value === createdWatchlist.value)) return [];
  return [createdWatchlist];
}

function getCreateSelectorItems(inputValue: string) {
  const trimmedInput = inputValue.trim();
  if (!trimmedInput) return [];
  return [
    {
      label: `Create "${trimmedInput}"`,
      value: `create:${trimmedInput}`,
      isCreateOption: true,
    },
  ];
}

function getSelectorItems(
  watchlists: WatchlistSummary[] | undefined,
  inputValue: string,
  createdWatchlist: SelectorItem | null,
) {
  const existingItems = getExistingSelectorItems(watchlists);
  const createdItems = getCreatedSelectorItems(createdWatchlist, existingItems);
  const createItems = getCreateSelectorItems(inputValue);
  const filteredExistingItems = filterExistingSelectorItems(existingItems, inputValue);
  return [...createItems, ...createdItems, ...filteredExistingItems];
}

export function SearchWatchlistSelector({
  watchlists,
  selectedWatchlistId,
  onSelect,
  disabled = false,
}: SearchWatchlistSelectorProps) {
  const [inputValue, setInputValue] = useState("");
  const [createdWatchlist, setCreatedWatchlist] = useState<SelectorItem | null>(null);
  const { createWatchlist, isCreating } = useCreateSearchWatchlist({
    onCreated: (watchlist) => {
      setCreatedWatchlist(watchlist);
      setInputValue("");
      onSelect(watchlist.value);
    },
  });
  const selectedWatchlistName = getSelectedWatchlistName(
    watchlists,
    selectedWatchlistId,
    createdWatchlist,
  );
  const items = useMemo<SearchWatchlistSelectorItem[]>(
    () => getSelectorItems(watchlists, inputValue, createdWatchlist),
    [createdWatchlist, inputValue, watchlists],
  );

  return (
    <SearchWatchlistCombobox
      items={items}
      selectedWatchlistId={selectedWatchlistId}
      selectedWatchlistName={selectedWatchlistName}
      disabled={disabled}
      isCreating={isCreating}
      onClear={() => {
        setInputValue("");
        onSelect("");
      }}
      onCreate={createWatchlist}
      onSelect={onSelect}
      onInputValueChange={setInputValue}
    />
  );
}
