import { Box, Button, Input, InputGroup, Spinner } from "@chakra-ui/react";
import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface SearchInputProperties {
  onSearch: (query: string) => void;
  defaultValue?: string;
  isLoading?: boolean;
}

export function SearchInput({ onSearch, defaultValue = "", isLoading }: SearchInputProperties) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const handleSubmit = () => {
    onSearch(value);
  };

  return (
    <Box display="flex" w="full" maxW="lg" alignItems="center" gap={2}>
      <InputGroup
        flex={1}
        startElement={<SearchIcon size={16} aria-hidden="true" />}
        startElementProps={{ color: "fg.muted" }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Search..."
          aria-label="Search media"
          h={10}
          bg="bg.subtle"
          borderColor="transparent"
          rounded="lg"
          focusRingColor="accent.solid"
          _focusVisible={{ borderColor: "accent.solid" }}
        />
      </InputGroup>
      <Button onClick={handleSubmit} disabled={isLoading} colorPalette="pink">
        {isLoading ? <Spinner size="sm" aria-label="Searching" /> : "Search"}
      </Button>
    </Box>
  );
}
