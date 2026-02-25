import { Effect } from "effect";
import { z } from "zod";
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

const GOOGLE_BOOKS_BASE_URL = "https://www.googleapis.com/books/v1/volumes";
const GOOGLE_BOOKS_API_ERROR = "Google Books API Error";
const GOOGLE_BOOKS_DETAILS_ERROR = "Google Books Details Error";

type GoogleBookItem = z.infer<typeof GoogleBookItemSchema>;

function normalizeBookThumbnail(thumbnail?: string): string | null {
  if (!thumbnail) {
    return null;
  }

  return thumbnail
    .replace("http:", "https:")
    .replace("&zoom=1", "&zoom=0")
    .replace("&edge=curl", "");
}

function buildGoogleBooksSearchUrl(query: string, page: number, apiKey: string): URL {
  const maxResults = API_PAGE_SIZE;
  const startIndex = (page - 1) * maxResults;
  const url = new URL(GOOGLE_BOOKS_BASE_URL);
  url.search = new URLSearchParams({
    q: query,
    startIndex: startIndex.toString(),
    maxResults: maxResults.toString(),
    key: apiKey,
  }).toString();
  return url;
}

function buildGoogleBooksDetailsUrl(id: string, apiKey: string): URL {
  const encodedId = encodeURIComponent(id);
  const url = new URL(`${GOOGLE_BOOKS_BASE_URL}/${encodedId}`);
  url.search = new URLSearchParams({ key: apiKey }).toString();
  return url;
}

const toUnifiedBook = (item: GoogleBookItem): UnifiedMedia => ({
  id: item.id,
  mediaType: "book",
  source: "google_books",
  title: item.volumeInfo.title ?? "Unknown Title",
  poster: normalizeBookThumbnail(item.volumeInfo.imageLinks?.thumbnail),
  year: item.volumeInfo.publishedDate?.split("-")[0],
  releaseDate: item.volumeInfo.publishedDate,
  rating: item.volumeInfo.averageRating != null ? item.volumeInfo.averageRating * 2 : undefined,
  overview: item.volumeInfo.description ?? undefined,
});

export async function searchBooks(
  query: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const program = Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("GOOGLE_BOOKS_API_KEY");
    const url = buildGoogleBooksSearchUrl(query, page, apiKey);

    const rawData = yield* fetchJson({
      url,
      context: GOOGLE_BOOKS_API_ERROR,
    }).pipe(Effect.catchAll(() => Effect.succeed({ items: [], totalItems: 0 })));
    const data = yield* parseWithSchema(GoogleBooksResponseSchema, rawData, GOOGLE_BOOKS_API_ERROR);

    return {
      results: (data.items ?? []).map(toUnifiedBook),
      totalResults: data.totalItems ?? 0,
    };
  });

  return runServerEffect(program);
}

export async function getBookDetails(id: string): Promise<UnifiedMedia> {
  const program = Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("GOOGLE_BOOKS_API_KEY");
    const url = buildGoogleBooksDetailsUrl(id, apiKey);

    const item = yield* fetchJson({
      url,
      context: GOOGLE_BOOKS_DETAILS_ERROR,
    });
    const data = yield* parseWithSchema(GoogleBookItemSchema, item, GOOGLE_BOOKS_DETAILS_ERROR);

    return toUnifiedBook(data);
  });

  return runServerEffect(program);
}
