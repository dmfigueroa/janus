import { SearchDiscoveryScreen } from "@/features/search/SearchDiscoveryScreen";
import {
  searchableMediaLabels,
  searchableMediaTypes,
  searchUnified,
  type SearchableMediaType,
} from "@/features/search/search/MediaSearch";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().optional().default(""),
  page: z.coerce.number().optional().default(1),
  type: z.enum(searchableMediaTypes).optional().default("movie"),
});

export type SearchType = SearchableMediaType;

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search: { query, type } }) => ({ query, type }),
  loader: ({ deps: { query, type } }) => searchUnified({ data: { query, page: 1, type } }),
  head: ({ match }) => ({
    meta: [{ title: `Search ${searchableMediaLabels[match.search.type]} - Janus` }],
  }),
  component: Search,
});

function Search() {
  const { query, type } = useSearch({ from: Route.fullPath });
  const initialData = Route.useLoaderData();
  return <SearchDiscoveryScreen query={query} type={type} initialData={initialData} />;
}
