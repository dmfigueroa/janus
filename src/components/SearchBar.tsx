import { Search, SlidersHorizontal } from "lucide-react";
import { Box, IconButton, Input, InputGroup } from "@chakra-ui/react";

export function SearchBar() {
  return (
    <Box display="flex" alignItems="center" gap={3}>
      <InputGroup flex={1} startElement={<Search size={16} aria-hidden="true" />}>
        <Input
          aria-label="Find a list, movie, or show"
          placeholder="Find a list, movie, or show..."
          h={12}
          bg="bg.surface"
          borderColor="transparent"
          rounded="lg"
          _focusVisible={{ borderColor: "accent.solid" }}
        />
      </InputGroup>
      <IconButton
        aria-label="Filter search results"
        variant="ghost"
        size="lg"
        rounded="lg"
        color="fg.muted"
        _hover={{ color: "fg.default", bg: "bg.subtle" }}
      >
        <SlidersHorizontal size={20} />
      </IconButton>
    </Box>
  );
}
