import { z } from "zod";
import { Effect } from "effect";
import { API_PAGE_SIZE } from "../-constants";
import { type UnifiedMedia } from "../-media";
import { fetchJson, parseWithSchema, requireEnvVar, runServerEffect } from "../-effect";

const GoogleBookItemSchema = z.object({
  id: z.string(),
  volumeInfo: z.object({
    title: z.string().optional(),
    imageLinks: z.object({ thumbnail: z.string().optional() }).optional(),
    publishedDate: z.string().optional(),
    averageRating: z.number().optional(),
    description: z.string().optional(),
  }),
});

const GoogleBooksResponseSchema = z.object({
  items: z.array(GoogleBookItemSchema).optional(),
  totalItems: z.number().optional(),
});

const toUnifiedBook = (item: z.infer<typeof GoogleBookItemSchema>): UnifiedMedia => ({
  id: item.id,
  mediaType: "book",
  source: "google_books",
  title: item.volumeInfo.title || "Unknown Title",
  poster:
    item.volumeInfo.imageLinks?.thumbnail
      ?.replace("http:", "https:")
      .replace("&zoom=1", "&zoom=0")
      .replace("&edge=curl", "") || null,
  year: item.volumeInfo.publishedDate?.split("-")[0],
  releaseDate: item.volumeInfo.publishedDate,
  rating: item.volumeInfo.averageRating ? item.volumeInfo.averageRating * 2 : undefined,
  overview: item.volumeInfo.description,
});

export async function searchBooks(
  query: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const program = Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("GOOGLE_BOOKS_API_KEY");
    const maxResults = API_PAGE_SIZE;
    const startIndex = (page - 1) * maxResults;
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.search = new URLSearchParams({
      q: query,
      startIndex: startIndex.toString(),
      maxResults: maxResults.toString(),
      key: apiKey,
    }).toString();

    const rawData = yield* fetchJson({
      url,
      context: "Google Books API Error",
    }).pipe(Effect.catchAll(() => Effect.succeed({ items: [], totalItems: 0 })));
    const data = yield* parseWithSchema(
      GoogleBooksResponseSchema,
      rawData,
      "Google Books API Error",
    );

    return {
      results: (data.items || []).map(toUnifiedBook),
      totalResults: data.totalItems || 0,
    };
  });

  return runServerEffect(program);
}

export async function getBookDetails(id: string) {
  const program = Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("GOOGLE_BOOKS_API_KEY");
    const encodedId = encodeURIComponent(id);
    const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodedId}`);
    url.search = new URLSearchParams({
      key: apiKey,
    }).toString();

    const item = yield* fetchJson({
      url,
      context: "Google Books Details Error",
    });
    const data = yield* parseWithSchema(GoogleBookItemSchema, item, "Google Books Details Error");

    return toUnifiedBook(data);
  });

  return runServerEffect(program);
}
