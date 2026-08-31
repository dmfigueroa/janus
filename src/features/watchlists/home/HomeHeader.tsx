import { Button, Flex, Heading, IconButton, Text } from "@chakra-ui/react";
import { CheckSquare } from "lucide-react";
import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/WatchlistMergeSelectionContext";

type HomeHeaderProps = {
  totals: WatchlistHomeData["totals"];
};

export function HomeHeader({ totals }: HomeHeaderProps) {
  const mergeSelection = useWatchlistMergeSelectionContext();
  const selectedCount = mergeSelection.selectedIds.length;

  return (
    <Flex as="header" direction="column" px={6} pt={8} pb={4} gap={3}>
      <Flex align="center" justify="space-between">
        <HeaderTitle selectionMode={mergeSelection.selectionMode} selectedCount={selectedCount} />
        <Flex gap={2}>
          <HeaderActions mergeSelection={mergeSelection} selectedCount={selectedCount} />
        </Flex>
      </Flex>

      <WatchlistTotals totals={totals} hidden={mergeSelection.selectionMode} />
    </Flex>
  );
}

function HeaderTitle({
  selectionMode,
  selectedCount,
}: {
  selectionMode: boolean;
  selectedCount: number;
}) {
  return (
    <Heading as="h1" size="3xl" fontWeight="extrabold" letterSpacing="tight">
      {selectionMode ? `${selectedCount} Selected` : "My Lists"}
    </Heading>
  );
}

function HeaderActions({
  mergeSelection,
  selectedCount,
}: {
  mergeSelection: ReturnType<typeof useWatchlistMergeSelectionContext>;
  selectedCount: number;
}) {
  if (mergeSelection.selectionMode) {
    return (
      <>
        <Button variant="ghost" onClick={mergeSelection.clearSelection}>
          Cancel
        </Button>
        <Button disabled={selectedCount < 2} onClick={mergeSelection.openMergeDialog}>
          Merge
        </Button>
      </>
    );
  }

  return (
    <IconButton
      size="sm"
      variant="ghost"
      rounded="full"
      bg="bg.surface"
      color="fg.muted"
      _hover={{ bg: "bg.subtle" }}
      onClick={mergeSelection.enterSelectionMode}
      aria-label="Select watchlists"
      title="Select watchlists"
    >
      <CheckSquare size={20} />
    </IconButton>
  );
}

function WatchlistTotals({ totals, hidden }: HomeHeaderProps & { hidden: boolean }) {
  if (hidden) return null;
  return (
    <Text fontSize="sm" color="fg.muted">
      {totals.watchlists} watchlists, {totals.items} items
    </Text>
  );
}
