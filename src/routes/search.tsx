import { SearchInput } from "../components/SearchInput";
import { SearchResults } from "../components/SearchResults";
import { searchUnified } from "../server/search";
import { useCallback } from "react";
import { createFileRoute, useNavigate, useSearch, useRouterState } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";

const searchSchema = z.object({
  query: z.string().optional().default(""),
  page: z.coerce.number().optional().default(1),
  type: z.enum(["movie", "tv", "game", "book", "comic", "anime", "manga"]).optional().default("movie"),
});

type SearchType = z.infer<typeof searchSchema>["type"];

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search: { query, type } }) => ({ query, type }),
  loader: async ({ deps: { query, type } }) => {
    if (!query) {
      return { results: [], page: 1, total_pages: 0, total_results: 0 };
    }

    return searchUnified({ data: { query, page: 1, type } });
  },
  component: Search,
});

function Search() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { query, type } = useSearch({ from: Route.fullPath });
  const initialData = Route.useLoaderData();

  const isLoadingRoute = useRouterState({ select: (s) => s.isLoading });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["search", query, type],
    queryFn: ({ pageParam }) => searchUnified({ data: { query, page: pageParam, type } }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    initialData: { pages: [initialData], pageParams: [1] },
    enabled: !!query,
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
          Find movies, shows, games, books, comics, anime and manga.
        </p>

        <SearchInput onSearch={handleSearch} defaultValue={query} isLoading={isLoadingRoute} />

        <Tabs value={type} onValueChange={handleTabChange} className="w-full max-w-3xl">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="movie">Movies</TabsTrigger>
            <TabsTrigger value="tv">TV</TabsTrigger>
            <TabsTrigger value="game">Games</TabsTrigger>
            <TabsTrigger value="book">Books</TabsTrigger>
            <TabsTrigger value="comic">Comics</TabsTrigger>
            <TabsTrigger value="anime">Anime</TabsTrigger>
            <TabsTrigger value="manga">Manga</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
