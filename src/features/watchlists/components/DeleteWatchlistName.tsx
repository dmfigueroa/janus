import { Flex, IconButton, Text } from "@chakra-ui/react";
import { Check, Copy } from "lucide-react";

export function DeleteWatchlistName({
  name,
  deleting,
  copied,
  onCopy,
}: {
  name: string;
  deleting: boolean;
  copied: boolean;
  onCopy: () => Promise<void>;
}) {
  return (
    <Flex
      align="center"
      gap={3}
      bg="bg.subtle"
      borderWidth="1px"
      borderColor="border"
      rounded="md"
      pl={4}
      pr={1}
      py={1}
    >
      <Text fontWeight="medium" flex="1" minW={0} overflowWrap="anywhere">
        {name}
      </Text>
      <IconButton
        type="button"
        variant="ghost"
        flexShrink={0}
        aria-label="Copy watchlist name"
        title="Copy watchlist name"
        disabled={deleting}
        onClick={() => void onCopy()}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </IconButton>
    </Flex>
  );
}
