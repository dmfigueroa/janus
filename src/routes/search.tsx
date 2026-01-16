import { SearchInput } from "../components/SearchInput";
import { SearchResults } from "../components/SearchResults";
import { BottomNav } from "../components/BottomNav";
import { searchMultimedia } from "../server/tmdb";
import { useCallback } from "react";
import { createFileRoute, useNavigate, useSearch, useRouterState } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().optional().default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search: { query } }) => ({ query }),
  loader: async ({ deps: { query } }) => {
    if (!query) {
      return { results: [], page: 1, total_pages: 0, total_results: 0 };
    }

    return searchMultimedia({ data: { query, page: 1 } });
  },
  component: Search,
});

function Search() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { query } = useSearch({ from: Route.fullPath });
  const initialData = Route.useLoaderData();

  const isLoadingRoute = useRouterState({ select: (s) => s.isLoading });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["search", query],
    queryFn: ({ pageParam }) => searchMultimedia({ data: { query, page: pageParam } }),
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
        },
      });
    },
    [navigate],
  );

  return (
    <div className="container mx-auto min-h-screen px-4 py-8 md:px-8 pb-24">
      <div className="mb-8 flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          <span className="text-primary">Discover</span>{" "}
          <span className="text-muted-foreground">Movies & TV</span>
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          Find where to stream new, popular & upcoming entertainment.
        </p>

        <SearchInput onSearch={handleSearch} defaultValue={query} isLoading={isLoadingRoute} />
      </div>

      <div className="mt-8">
        <SearchResults
          results={allResults}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </div>
      <BottomNav />
    </div>
  );
}
