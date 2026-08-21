import { Box, Container, Heading, Stack, Tabs, Text } from "@chakra-ui/react";
import { SearchInput } from "@/components/SearchInput";
import { SearchResults } from "@/features/search/SearchResults";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "@/server/Media";
import type { UnifiedMedia } from "@/server/Media";
import { useSearchResults } from "./useSearchResults";
import { useSearchNavigation } from "./useSearchNavigation";

interface SearchScreenProps {
  query: string;
  type: UnifiedMedia["mediaType"];
  initialData: {
    results: UnifiedMedia[];
    page: number;
    total_pages: number;
    total_results: number;
    rejected?: boolean;
    message?: string;
  };
}

function getActiveTab(type: UnifiedMedia["mediaType"]) {
  if (isDeprecatedMediaType(type)) return "movie";
  return type;
}

function DeprecatedSearchNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Box
      maxW="3xl"
      mx="auto"
      mt={8}
      rounded="md"
      borderWidth="1px"
      borderColor="orange.muted"
      bg="orange.subtle"
      color="orange.fg"
      px={4}
      py={3}
      fontSize="sm"
    >
      {DEPRECATED_MEDIA_MESSAGE} Please switch to Movies, TV, Games, Books, or Comics.
    </Box>
  );
}

export function SearchScreen({ query, type, initialData }: SearchScreenProps) {
  const { allResults, fetchNextPage, hasNextPage, isFetchingNextPage } = useSearchResults({
    query,
    type,
    initialData,
  });
  const { handleSearch, handleTabChange } = useSearchNavigation(query, type);
  const isDeprecated = isDeprecatedMediaType(type);
  const activeTab = getActiveTab(type);

  return (
    <Box minH="100vh" pb={24}>
      <Container maxW="7xl" px={{ base: 4, md: 8 }} py={8}>
        <Stack align="center" gap={6} mb={8}>
          <Heading
            as="h1"
            fontSize={{ base: "3xl", md: "5xl" }}
            fontWeight="bold"
            letterSpacing="tight"
            textAlign="center"
          >
            <Text as="span" color="accent.solid">
              Discover
            </Text>{" "}
            <Text as="span" color="fg.muted">
              Everything
            </Text>
          </Heading>
          <Text maxW="md" textAlign="center" color="fg.muted">
            Find movies, shows, games, books, and comics.
          </Text>
          <Text
            maxW="xl"
            rounded="md"
            borderWidth="1px"
            borderColor="orange.muted"
            bg="orange.subtle"
            color="orange.fg"
            px={3}
            py={2}
            textAlign="center"
            fontSize="sm"
          >
            {DEPRECATED_MEDIA_MESSAGE}
          </Text>

          <SearchInput onSearch={handleSearch} defaultValue={query} isLoading={false} />

          <Tabs.Root
            value={activeTab}
            onValueChange={({ value }) => handleTabChange(value)}
            w="full"
            maxW="3xl"
          >
            <Tabs.List>
              <Tabs.Trigger value="movie">Movies</Tabs.Trigger>
              <Tabs.Trigger value="tv">TV</Tabs.Trigger>
              <Tabs.Trigger value="game">Games</Tabs.Trigger>
              <Tabs.Trigger value="book">Books</Tabs.Trigger>
              <Tabs.Trigger value="comic">Comics</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        </Stack>

        <DeprecatedSearchNotice visible={isDeprecated && Boolean(query)} />

        <Box mt={8}>
          <SearchResults
            results={allResults}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        </Box>
      </Container>
    </Box>
  );
}
