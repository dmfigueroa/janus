import { Button, Flex } from "@chakra-ui/react";
import { Check } from "lucide-react";
import type { WatchlistSummary } from "../list/Query";
import { useCardRotation } from "./useCardRotation";

export function CardRotationActions({ watchlist }: { watchlist: WatchlistSummary }) {
  const { pending, perform } = useCardRotation(watchlist);
  const nextItem = watchlist.stats.nextUnwatched;
  if (!nextItem || watchlist.pausedAt) return null;
  return (
    <Flex gap={1} wrap="wrap">
      <Button
        transition="transform 120ms cubic-bezier(0.23, 1, 0.32, 1)"
        _active={{ transform: "scale(0.98)" }}
        _motionReduce={{ transition: "none", _active: { transform: "none" } }}
        size="sm"
        fontSize="xs"
        gap={1}
        minH="44px"
        flex="1"
        px={2}
        disabled={pending}
        aria-label={`Mark ${nextItem.title} watched`}
        onClick={() => void perform("watched")}
      >
        <Check size={14} /> Watched
      </Button>
      <Button
        transition="transform 120ms cubic-bezier(0.23, 1, 0.32, 1)"
        _active={{ transform: "scale(0.98)" }}
        _motionReduce={{ transition: "none", _active: { transform: "none" } }}
        size="sm"
        fontSize="xs"
        gap={1}
        minH="44px"
        flex="1"
        px={2}
        variant="outline"
        disabled={pending}
        aria-label={`Skip turn for ${watchlist.name}`}
        onClick={() => void perform("skip")}
      >
        Skip turn
      </Button>
    </Flex>
  );
}
