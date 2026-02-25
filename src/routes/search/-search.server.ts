import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { z } from "zod";
import { searchMultimedia } from "@/routes/_shared/providers/-tmdb.server";
import { searchBooks } from "@/routes/_shared/providers/-google-books.server";
import { searchGames } from "@/routes/_shared/providers/-rawg.server";
import { searchComics } from "@/routes/_shared/providers/-comicvine.server";
import { searchAnilist } from "@/routes/_shared/providers/-anilist.server";
import { type UnifiedMedia } from "@/routes/_shared/-media";
import { API_PAGE_SIZE } from "@/routes/_shared/-constants";
import { requireEnvVar, runServerHandler } from "@/routes/_shared/-effect";

const searchInputSchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().default(1),
  type: z.enum(["movie", "tv", "game", "book", "comic", "anime", "manga"]).default("movie"),
});

type ProviderSearchResult = { results: UnifiedMedia[]; totalResults: number };

function searchNonTmdbMedia(params: {
  query: string;
  page: number;
  type: Exclude<z.infer<typeof searchInputSchema>["type"], "movie" | "tv">;
}): Effect.Effect<ProviderSearchResult, Error> {
  const { query, page, type } = params;

  switch (type) {
    case "book":
      return searchBooks(query, page);
    case "game":
      return Effect.gen(function* () {
        const apiKey = yield* requireEnvVar("RAWG_API_KEY");
        return yield* searchGames(query, apiKey, page);
      });
    case "comic":
      return Effect.gen(function* () {
        const apiKey = yield* requireEnvVar("COMICVINE_API_KEY");
        return yield* searchComics(query, apiKey, page);
      });
    case "anime":
      return searchAnilist(query, "ANIME", page);
    case "manga":
      return searchAnilist(query, "MANGA", page);
  }
}

export const searchUnified = createServerFn({ method: "GET" })
  .inputValidator((data) => searchInputSchema.parse(data))
  .handler(({ data }) => {
    const { query, type, page } = data;

    return runServerHandler(
      Effect.gen(function* () {
        if (type === "movie" || type === "tv") {
          return yield* searchMultimedia(query, page, type);
        }

        const { results, totalResults } = yield* searchNonTmdbMedia({ query, page, type });
        const totalPages = Math.ceil(totalResults / API_PAGE_SIZE);

        return {
          results,
          page,
          total_pages: totalPages || 1,
          total_results: totalResults,
        };
      }),
      "Unified search failed",
    );
  });
