"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { consola } from "consola";
import { API_PAGE_SIZE } from "./constants";
import { type UnifiedMedia, UnifiedMediaSchema } from "./media";
import { CacheService } from "@/utils/cache";

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

const getGoogleBooksApiKey = () => {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_BOOKS_API_KEY is not configured");
  return apiKey;
};

const SearchBooksResponseSchema = z.object({
  results: z.array(UnifiedMediaSchema),
  totalResults: z.number(),
});

export async function searchBooksInternal(data: {
  query: string;
  page: number;
  forceRefresh?: boolean;
}): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const { query, page, forceRefresh } = data;
  const cacheKey = `google-books-search-${query}-${page}`;

  return CacheService.withCache(
    cacheKey,
    "google_books",
    async () => {
      try {
        const apiKey = getGoogleBooksApiKey();
        const maxResults = API_PAGE_SIZE;
        const startIndex = (page - 1) * maxResults;
        const url = new URL("https://www.googleapis.com/books/v1/volumes");
        url.search = new URLSearchParams({
          q: query,
          startIndex: startIndex.toString(),
          maxResults: maxResults.toString(),
          key: apiKey,
        }).toString();

        const res = await fetch(url.toString());
        if (!res.ok) return { results: [], totalResults: 0 };

        const rawData = await res.json();
        const parsedData = GoogleBooksResponseSchema.parse(rawData);

        const results: UnifiedMedia[] = (parsedData.items || []).map((item) => ({
          id: item.id,
          mediaType: "book" as const,
          source: "google_books" as const,
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
        }));

        return {
          results,
          totalResults: parsedData.totalItems || 0,
        };
      } catch (e) {
        consola.error("Google Books API Error", e);
        return { results: [], totalResults: 0 };
      }
    },
    SearchBooksResponseSchema,
    { forceRefresh },
  );
}

export const searchBooks = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        query: z.string().min(1),
        page: z.coerce.number().default(1),
        forceRefresh: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return searchBooksInternal(data);
  });

export async function getBookDetailsInternal(data: {
  id: string;
  forceRefresh?: boolean;
}): Promise<UnifiedMedia> {
  const { id, forceRefresh } = data;
  const cacheKey = `google-books-details-${id}`;

  return CacheService.withCache(
    cacheKey,
    "google_books",
    async () => {
      try {
        const apiKey = getGoogleBooksApiKey();
        const url = new URL(`https://www.googleapis.com/books/v1/volumes/${id}`);
        url.search = new URLSearchParams({
          key: apiKey,
        }).toString();

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("Failed to fetch book details");

        const item = await res.json();
        const parsedItem = GoogleBookItemSchema.parse(item);

        const result: UnifiedMedia = {
          id: parsedItem.id,
          mediaType: "book" as const,
          source: "google_books" as const,
          title: parsedItem.volumeInfo.title || "Unknown Title",
          poster:
            parsedItem.volumeInfo.imageLinks?.thumbnail
              ?.replace("http:", "https:")
              .replace("&zoom=1", "&zoom=0")
              .replace("&edge=curl", "") || null,
          year: parsedItem.volumeInfo.publishedDate?.split("-")[0],
          releaseDate: parsedItem.volumeInfo.publishedDate,
          rating: parsedItem.volumeInfo.averageRating
            ? parsedItem.volumeInfo.averageRating * 2
            : undefined,
          overview: parsedItem.volumeInfo.description,
        };
        return result;
      } catch (e) {
        consola.error("Google Books Details Error", e);
        throw e;
      }
    },
    UnifiedMediaSchema,
    { forceRefresh },
  );
}

export const getBookDetails = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        id: z.string(),
        forceRefresh: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return getBookDetailsInternal(data);
  });
