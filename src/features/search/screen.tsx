import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SearchInput } from "@/components/SearchInput";
import { SearchResults } from "@/features/search/SearchResults";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { searchUnified } from "@/server/search";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "@/server/media";
import type { UnifiedMedia } from "@/server/media";

interface SearchScreenProps {
  query: string;
  type: "movie" | "tv" | "game" | "book" | "comic" | "anime" | "manga";
  initialData: {
    results: UnifiedMedia[];
    page: number;
    total_pages: number;
    total_results: number;
    rejected?: boolean;
    message?: string;
  };
}

export function SearchScreen({ query, type, initialData }: SearchScreenProps) {
  const navigate = useNavigate();
  const searchUnifiedFn = useServerFn(searchUnified);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["search", query, type],
    queryFn: ({ pageParam }) => {
      if (!query) {
        return Promise.resolve({
          results: [],
          page: pageParam,
          total_pages: 1,
          total_results: 0,
        });
      }

      if (isDeprecatedMediaType(type)) {
        return Promise.resolve({
          results: [],
          page: pageParam,
          total_pages: 1,
          total_results: 0,
          rejected: true,
          message: DEPRECATED_MEDIA_MESSAGE,
        });
      }

      return searchUnifiedFn({ data: { query, page: pageParam, type } });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    initialData: !!query ? { pages: [initialData], pageParams: [1] } : undefined,
  });

  const allResults = data?.pages.flatMap((page) => page.results) || [];

  const handleSearch = useCallback(
    (newQuery: string) => {
      navigate({
        to: "/search",
        search: {
          query: newQuery,
          type,
        },
      });
    },
    [navigate, type],
  );

  const handleTabChange = useCallback(
    (newType: string) => {
      navigate({
        to: "/search",
        search: {
          query,
          type: newType as SearchScreenProps["type"],
        },
      });
    },
    [navigate, query],
  );

  return (
    <div className="container mx-auto min-h-screen px-4 py-8 md:px-8 pb-24">
      <div className="mb-8 flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          <span className="text-primary">Discover</span>{" "}
          <span className="text-muted-foreground">Everything</span>
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          Find movies, shows, games, books, and comics.
        </p>
        <p className="max-w-xl rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-700">
          {DEPRECATED_MEDIA_MESSAGE}
        </p>

        <SearchInput onSearch={handleSearch} defaultValue={query} isLoading={false} />

        <Tabs
          value={isDeprecatedMediaType(type) ? "movie" : type}
          onValueChange={handleTabChange}
          className="w-full max-w-3xl"
        >
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="movie">Movies</TabsTrigger>
            <TabsTrigger value="tv">TV</TabsTrigger>
            <TabsTrigger value="game">Games</TabsTrigger>
            <TabsTrigger value="book">Books</TabsTrigger>
            <TabsTrigger value="comic">Comics</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isDeprecatedMediaType(type) && query ? (
        <div className="mx-auto mt-8 max-w-3xl rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          {DEPRECATED_MEDIA_MESSAGE} Please switch to Movies, TV, Games, Books, or Comics.
        </div>
      ) : null}

      <div className="mt-8">
        <SearchResults
          results={allResults}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </div>
    </div>
  );
}
