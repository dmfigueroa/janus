import { SearchDiscoveryScreen } from "@/features/search/SearchDiscoveryScreen";
import { searchUnified } from "../server/Search";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { isDeprecatedMediaType } from "../server/Media";

const searchSchema = z.object({
  query: z.string().optional().default(""),
  page: z.coerce.number().optional().default(1),
  type: z
    .enum(["movie", "tv", "game", "book", "comic", "anime", "manga"])
    .optional()
    .default("movie"),
});

export type SearchType = z.infer<typeof searchSchema>["type"];

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
  const { query, type } = useSearch({ from: Route.fullPath });
  const initialData = Route.useLoaderData();
  return <SearchDiscoveryScreen query={query} type={type} initialData={initialData} />;
}
