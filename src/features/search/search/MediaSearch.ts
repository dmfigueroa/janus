import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const searchableMediaTypes = [
  "movie",
  "tv",
  "game",
  "book",
  "comic",
  "anime",
  "manga",
] as const;

export type SearchableMediaType = (typeof searchableMediaTypes)[number];

export const searchableMediaLabels: Record<SearchableMediaType, string> = {
  movie: "Movies",
  tv: "TV",
  game: "Games",
  book: "Books",
  comic: "Comics",
  anime: "Anime",
  manga: "Manga",
};

export const searchableMediaTabs = searchableMediaTypes
  .filter((type) => type !== "anime" && type !== "manga")
  .map((type) => ({ label: searchableMediaLabels[type], value: type }));

const mediaSearchInputSchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().default(1),
  type: z.enum(searchableMediaTypes).default("movie"),
});

export const searchUnified = createServerFn({ method: "GET" })
  .validator((data) => mediaSearchInputSchema.parse(data))
  .handler(({ data }) =>
    import("./MediaSearch.server").then(({ searchMedia }) =>
      searchMedia({ query: data.query, mediaType: data.type, page: data.page }),
    ),
  );
