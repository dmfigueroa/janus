import { SearchInput } from "../components/SearchInput";
import { SearchResults } from "../components/SearchResults";
import { searchMultimedia } from "../server/tmdb";
import { createFileRoute, useNavigate, useSearch, useRouterState } from "@tanstack/react-router";
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

    return searchMultimedia({ data: { query } });
  },
  component: Search,
});

function Search() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { query } = useSearch({ from: Route.fullPath });
  const data = Route.useLoaderData();

  const isLoading = useRouterState({ select: (s) => s.isLoading });

  const handleSearch = (newQuery: string) => {
    navigate({
      search: {
        query: newQuery,
      },
    });
  };

  return (
    <div className="container mx-auto min-h-screen px-4 py-8 md:px-8">
      <div className="mb-8 flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          <span className="text-primary">Discover</span>{" "}
          <span className="text-muted-foreground">Movies & TV</span>
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          Find where to stream new, popular & upcoming entertainment.
        </p>

        <SearchInput onSearch={handleSearch} defaultValue={query} isLoading={isLoading} />
      </div>

      <div className="mt-8">
        <SearchResults results={data?.results || []} />
      </div>
    </div>
  );
}
