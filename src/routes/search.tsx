import { SearchDiscoveryScreen } from "@/features/search/SearchDiscoveryScreen";
import {
  normalizeMediaSearchQuery,
  searchableMediaLabels,
  searchableMediaTypes,
  type SearchableMediaType,
} from "@/features/search/search/MediaSearch";
import { searchMediaInfiniteQueryOptions } from "@/features/search/useSearchResults";
import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  query: z.union([z.string(), z.number().transform(String)]).catch(""),
  type: z.enum(searchableMediaTypes).catch("movie"),
});

export type SearchType = SearchableMediaType;

type SearchRouteInput = {
  query?: string;
  type?: SearchableMediaType;
};

function validateSearch(search: SearchRouteInput & SearchSchemaInput) {
  return searchSchema.parse(search);
}

export const Route = createFileRoute("/search")({
  validateSearch,
  loaderDeps: ({ search: { query, type } }) => ({
    query: normalizeMediaSearchQuery(query),
    type,
  }),
  loader: async ({ context, deps: { query, type } }) => {
    await context.queryClient.ensureInfiniteQueryData({
      ...searchMediaInfiniteQueryOptions({ query, type }),
      revalidateIfStale: true,
    });
  },
  head: ({ match }) => ({
    meta: [{ title: `Search ${searchableMediaLabels[match.search.type]} - Janus` }],
  }),
  component: Search,
});

function Search() {
  const { query, type } = Route.useSearch();
  return <SearchDiscoveryScreen query={query} type={type} />;
}
