import { Flex, Text } from "@chakra-ui/react";
import { Info } from "lucide-react";

export function AutoOrderingNotice() {
  return (
    <Flex align="flex-start" gap={2} rounded="md" bg="bg.subtle" p={3} color="fg.muted">
      <Info size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <Text fontSize="xs">
        This watchlist is ordered by release date. The item will be inserted near similar release
        dates.
      </Text>
    </Flex>
  );
}
