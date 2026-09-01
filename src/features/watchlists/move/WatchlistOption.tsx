import { Box, Button, Center, Text } from "@chakra-ui/react";
import { Check } from "lucide-react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";

export type WatchlistOptionProps = {
  optionKey: number;
  watchlist: WatchlistSummary;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: number) => void;
};

export function WatchlistOption({
  optionKey,
  watchlist,
  selected,
  disabled,
  onSelect,
}: WatchlistOptionProps) {
  const itemCountLabel = formatItemCount(watchlist.stats.totalItems);

  return (
    <Button
      key={optionKey}
      type="button"
      variant="ghost"
      justifyContent="flex-start"
      h="auto"
      minH={12}
      gap={3}
      px={3}
      py={2}
      bg={selected ? "bg.subtle" : "transparent"}
      _hover={{ bg: "bg.subtle" }}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect(watchlist.id)}
    >
      <SelectionCheckbox selected={selected} />
      <Box minW={0} textAlign="left">
        <Text truncate fontSize="sm" fontWeight="medium">
          {watchlist.name}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {itemCountLabel}
        </Text>
      </Box>
    </Button>
  );
}

function SelectionCheckbox({ selected }: { selected: boolean }) {
  const selectionStyle = selected
    ? { borderColor: "accent.solid", bg: "accent.solid" }
    : { borderColor: "fg.muted", bg: "transparent" };

  return (
    <Center
      boxSize={4}
      flexShrink={0}
      rounded="sm"
      borderWidth="1px"
      {...selectionStyle}
      color="accent.contrast"
      aria-hidden="true"
    >
      {selected ? <Check size={12} strokeWidth={2.5} /> : null}
    </Center>
  );
}

function formatItemCount(itemCount: number) {
  return `${itemCount} item${itemCount !== 1 ? "s" : ""}`;
}
