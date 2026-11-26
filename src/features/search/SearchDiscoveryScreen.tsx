import { useEffect, useMemo } from "react";
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

function getDeprecationNoticeText(isDeprecated: boolean, message: string | undefined) {
  if (isDeprecated && message) {
    return `${message} Please switch to Movies, TV, Games, Books, or Comics.`;
  }

  return DEPRECATED_MEDIA_MESSAGE;
}

function buildProviderFailure({
  status,
  message,
  query,
  type,
  initialData,
  dataUpdatedAt,
}: {
  status: MediaSearchOutcome["status"];
  message: string | undefined;
  query: string;
  type: SearchableMediaType;
  initialData: MediaSearchOutcome;
  dataUpdatedAt: number;
}) {
  if (status !== "provider_unavailable" || !message) {
    return null;
  }

  return { message, query, type, initialData, dataUpdatedAt };
}

export function SearchDiscoveryScreen({
  query,
  type,
  initialData,
}: SearchDiscoveryScreenProperties) {
  const {
    allResults,
    status,
    message,
    dataUpdatedAt,
    isLoading: isSearching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSearchResults({
    query,
    type,
    initialData,
  });
  const { handleSearch, handleTabChange, isNavigating } = useSearchNavigation(query, type);
  const isDeprecated = status === "deprecated_media_type";
  const isLoading = isSearching || isNavigating;
  const activeTab = getActiveTab(type);
  const deprecationNotice = getDeprecationNoticeText(isDeprecated, message);
  const providerFailure = useMemo(
    () => buildProviderFailure({ status, message, query, type, initialData, dataUpdatedAt }),
    [status, message, query, type, initialData, dataUpdatedAt],
  );

  useEffect(() => {
    if (!providerFailure) return;

    toaster.create({
      id: PROVIDER_UNAVAILABLE_TOAST_ID,
      type: "error",
      title: providerFailure.message,
    });
  }, [providerFailure]);

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
            {deprecationNotice}
          </Text>

          <SearchInput onSearch={handleSearch} defaultValue={query} isLoading={isLoading} />

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
