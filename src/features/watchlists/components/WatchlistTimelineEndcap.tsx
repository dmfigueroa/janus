import { Flag } from "lucide-react";
import { Flex, Spinner, Text } from "@chakra-ui/react";
import type { RefObject } from "react";

export function WatchlistTimelineEndcap({
  hasMore,
  sentinelRef,
}: {
  hasMore?: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <Flex position="relative" mt={12} pb={12} ref={sentinelRef} align="center">
      <Flex align="center">
        <TimelineStatusPill hasMore={hasMore} />
      </Flex>
    </Flex>
  );
}

function TimelineStatusPill({ hasMore }: { hasMore?: boolean }) {
  if (hasMore) {
    return (
      <Flex
        position="relative"
        zIndex={10}
        h={8}
        align="center"
        gap={2}
        rounded="full"
        bg="bg.canvas"
        px={4}
        fontSize="xs"
        fontWeight="medium"
        color="fg.muted"
        borderWidth="1px"
        borderColor="border.default"
        ml={{ base: 0, md: 4 }}
      >
        <Spinner size="xs" />
        <Text>Loading more...</Text>
      </Flex>
    );
  }

  return (
    <Flex
      position="relative"
      zIndex={10}
      h={8}
      align="center"
      gap={2}
      rounded="full"
      bg="bg.canvas"
      px={4}
      fontSize="xs"
      fontWeight="medium"
      color="fg.muted"
      borderWidth="1px"
      borderColor="border.default"
      ml={{ base: 0, md: 4 }}
    >
      <Flag size={12} />
      <Text>End of Watchlist</Text>
    </Flex>
  );
}
