import { Box, Flex, IconButton } from "@chakra-ui/react";
import { Check, SkipForward } from "lucide-react";
import type { WatchlistSummary } from "../list/Query";
import { useCardRotation } from "./useCardRotation";

export function CardRotationActions({ watchlist }: { watchlist: WatchlistSummary }) {
  const { pending, perform } = useCardRotation(watchlist);
  const nextItem = watchlist.stats.nextUnwatched;
  if (!nextItem || watchlist.pausedAt) return null;
  return (
    <Flex position="absolute" bottom={1} right={1} zIndex={20} gap={1}>
      <IconButton
        variant="plain"
        w="44px"
        h="44px"
        minW="44px"
        rounded="full"
        color="accent.solid"
        disabled={pending}
        aria-label={`Mark ${nextItem.title} watched`}
        title={`Mark ${nextItem.title} watched`}
        onClick={() => void perform("watched")}
      >
        <ActionDisc>
          <Check size={18} strokeWidth={2.5} />
        </ActionDisc>
      </IconButton>
      <IconButton
        variant="plain"
        w="44px"
        h="44px"
        minW="44px"
        rounded="full"
        color="white"
        disabled={pending}
        aria-label={`Skip turn for ${watchlist.name}`}
        title="Skip turn: move to back of rotation"
        onClick={() => void perform("skip")}
      >
        <ActionDisc>
          <SkipForward size={18} />
        </ActionDisc>
      </IconButton>
    </Flex>
  );
}

function ActionDisc({ children }: { children: React.ReactNode }) {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      w={8}
      h={8}
      bg="blackAlpha.800"
      rounded="full"
      borderWidth="1px"
      borderColor="whiteAlpha.300"
    >
      {children}
    </Box>
  );
}
