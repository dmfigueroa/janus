import { Box } from "@chakra-ui/react";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";

export function ReleaseTimelineDecorations({
  itemOrderMode,
}: {
  itemOrderMode: WatchlistItemOrderMode;
}) {
  if (itemOrderMode !== "release") {
    return null;
  }

  return (
    <>
      <Box
        position="absolute"
        bottom={12}
        left="26px"
        top={6}
        w="2px"
        bg="border.default"
        display={{ base: "block", md: "none" }}
      />
      <Box
        position="absolute"
        bottom={12}
        left={8}
        top={0}
        w="2px"
        bg="border.default"
        display={{ base: "none", md: "block" }}
      />
    </>
  );
}
