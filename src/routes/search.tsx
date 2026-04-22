import { SearchInput } from "../components/SearchInput";
import { SearchResults } from "@/features/search/SearchResults";
import { searchUnified } from "../server/search";
import { useCallback } from "react";
import { createFileRoute, useNavigate, useSearch, useRouterState } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "../server/media";

const searchSchema = z.object({
  query: z.string().optional().default(""),
  page: z.coerce.number().optional().default(1),
  type: z
    .enum(["movie", "tv", "game", "book", "comic", "anime", "manga"])
    .optional()
    .default("movie"),
});

type SearchType = z.infer<typeof searchSchema>["type"];

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search: { query, type } }) => ({ query, type }),
  loader: async ({ deps: { query, type } }) => {
    if (!query) {
      return { results: [], page: 1, total_pages: 0, total_results: 0 };
    }

    if (isDeprecatedMediaType(type)) {
      return {
        results: [],
        page: 1,
        total_pages: 1,
        total_results: 0,
        rejected: true,
      };
    }

    return searchUnified({ data: { query, page: 1, type } });
  },
  component: Search,
});

function Search() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { query, type } = useSearch({ from: Route.fullPath });
  const initialData = Route.useLoaderData();
  const isDeprecatedType = isDeprecatedMediaType(type);
  const searchUnifiedFn = useServerFn(searchUnified);

  const isLoadingRoute = useRouterState({ select: (s) => s.isLoading });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["search", query, type],
    queryFn: ({ pageParam }) => {
      if (isDeprecatedType) {
        return Promise.resolve({
          results: [],
          page: pageParam,
          total_pages: 1,
          total_results: 0,
          rejected: true,
        });
      }

      return searchUnifiedFn({ data: { query, page: pageParam, type } });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    initialData: { pages: [initialData], pageParams: [1] },
    enabled: !!query && !isDeprecatedType,
  });

  const allResults = data?.pages.flatMap((page) => page.results) || [];

  const handleSearch = useCallback(
    (newQuery: string) => {
      navigate({
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
        search: {
          query,
          type: newType as SearchType,
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

        <SearchInput onSearch={handleSearch} defaultValue={query} isLoading={isLoadingRoute} />

        <Tabs
          value={isDeprecatedType ? "movie" : type}
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

      {isDeprecatedType && query ? (
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
