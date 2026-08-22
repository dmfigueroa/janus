import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import { createWatchlist } from "@/features/watchlists/create/Mutation";
import { watchlistListQueryKey, type WatchlistSummary } from "@/features/watchlists/list/Query";
import { SearchWatchlistCombobox } from "./SearchWatchlistCombobox";

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

const watchlistSelectorFilters = { orderBy: "lastAdded" } as const;

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
  const [isCreating, setIsCreating] = useState(false);
  const createWatchlistFn = useServerFn(createWatchlist);
  const queryClient = useQueryClient();
  const router = useRouter();
  const selectedWatchlistName = getSelectedWatchlistName(
    watchlists,
    selectedWatchlistId,
    createdWatchlist,
  );
  const items = useMemo<SearchWatchlistSelectorItem[]>(
    () => getSelectorItems(watchlists, inputValue, createdWatchlist),
    [createdWatchlist, inputValue, watchlists],
  );

  const createNewWatchlist = async (name: string) => {
    setIsCreating(true);
    try {
      const newWatchlist = await createWatchlistFn({ data: { name } });
      const newWatchlistId = newWatchlist.id.toString();
      setCreatedWatchlist({ label: newWatchlist.name, value: newWatchlistId });
      setInputValue("");
      onSelect(newWatchlistId);
      await queryClient.invalidateQueries({
        queryKey: watchlistListQueryKey(watchlistSelectorFilters),
      });
      await router.invalidate?.();
    } catch (error) {
      console.error(error);
      toaster.create({ type: "error", title: "Failed to create watchlist" });
    } finally {
      setIsCreating(false);
    }
  };

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
      onCreate={(name) => void createNewWatchlist(name)}
      onSelect={onSelect}
      onInputValueChange={setInputValue}
    />
  );
}
