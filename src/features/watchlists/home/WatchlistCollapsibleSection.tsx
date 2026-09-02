import { Box, Collapsible, Heading } from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { WatchlistGrid } from "@/features/watchlists/home/WatchlistGrid";

type WatchlistCollapsibleSectionProps = {
  title: string;
  watchlists: WatchlistSummary[];
};

export function WatchlistCollapsibleSection({
  title,
  watchlists,
}: WatchlistCollapsibleSectionProps) {
  if (watchlists.length === 0) {
    return null;
  }

  const heading = `${title} (${watchlists.length})`;

  return (
    <Collapsible.Root mt={8}>
      <Collapsible.Trigger w="full" cursor="pointer">
        <Box display="flex" alignItems="center" justifyContent="space-between" py={2}>
          <Heading as="h3" size="lg" fontWeight="bold" letterSpacing="tight">
            {heading}
          </Heading>
          <Collapsible.Indicator color="fg.muted">
            <ChevronDown size={20} />
          </Collapsible.Indicator>
        </Box>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <WatchlistGrid
          watchlists={watchlists}
          selectionMode={false}
          selectedIdSet={new Set()}
          onToggle={() => {}}
          showCreateTile={false}
        />
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
