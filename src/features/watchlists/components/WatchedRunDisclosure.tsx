import { Box, Button } from "@chakra-ui/react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function WatchedRunDisclosure({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = count === 1 ? "1 watched item" : `${count} watched items`;
  return (
    <Box pt={2}>
      <Button
        variant="ghost"
        color="fg.muted"
        size="sm"
        minH="44px"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <WatchedRunChevron expanded={expanded} />
        {label}
        {expanded ? " — collapse" : " hidden"}
      </Button>
    </Box>
  );
}

function WatchedRunChevron({ expanded }: { expanded: boolean }) {
  return expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />;
}
