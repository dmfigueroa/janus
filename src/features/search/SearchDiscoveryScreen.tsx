import { useEffect } from "react";
import { Box, Container, Heading, Stack, Tabs, Text } from "@chakra-ui/react";
import { toaster } from "@/app/Toaster";
import { SearchResults } from "@/features/search/SearchResults";
import {
  searchableMediaTabs,
  type MediaSearchOutcome,
  type SearchableMediaType,
} from "@/features/search/search/MediaSearch";
import { DEPRECATED_MEDIA_MESSAGE } from "@/server/Media";
import { SearchInput } from "./SearchInput";
import { useSearchResults } from "./useSearchResults";
import { useSearchNavigation } from "./useSearchNavigation";

interface SearchDiscoveryScreenProperties {
  query: string;
  type: SearchableMediaType;
  initialData: MediaSearchOutcome;
}

const PROVIDER_UNAVAILABLE_TOAST_ID = "media-search-provider-unavailable";

function SearchMediaTabItems() {
  return searchableMediaTabs.map(SearchMediaTabItem);
}

function SearchMediaTabItem(tab: (typeof searchableMediaTabs)[number]) {
  return (
    <Tabs.Trigger key={tab.value} value={tab.value}>
      {tab.label}
    </Tabs.Trigger>
  );
}

function getActiveTab(type: SearchableMediaType) {
  return searchableMediaTabs.find((tab) => tab.value === type)?.value ?? "movie";
}

function DeprecatedSearchNotice({ message }: { message?: string }) {
  if (!message) return null;
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
      {message} Please switch to Movies, TV, Games, Books, or Comics.
    </Box>
  );
}

export function SearchDiscoveryScreen({
  query,
  type,
  initialData,
}: SearchDiscoveryScreenProperties) {
  const { allResults, status, message, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSearchResults({
      query,
      type,
      initialData,
    });
  const { handleSearch, handleTabChange } = useSearchNavigation(query, type);
  const isDeprecated = status === "deprecated_media_type";
  const activeTab = getActiveTab(type);

  useEffect(() => {
    if (status !== "provider_unavailable" || !message) return;

    toaster.create({
      id: PROVIDER_UNAVAILABLE_TOAST_ID,
      type: "error",
      title: message,
    });
  }, [status, message]);

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
            colorPalette="pink"
            w="full"
            maxW="3xl"
          >
            <Tabs.List>
              <SearchMediaTabItems />
            </Tabs.List>
          </Tabs.Root>
        </Stack>

        <DeprecatedSearchNotice message={isDeprecated ? message : undefined} />

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
