import { z } from "zod";
import { API_PAGE_SIZE } from "./constants";
import { type UnifiedMedia } from "./media";

// Cache Configuration
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_SIZE = 100;

interface CacheEntry {
  data: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }

  // Refresh LRU position by deleting and re-inserting
  cache.delete(key);
  cache.set(key, entry);

  return entry.data as T;
}

function setInCache(key: string, data: unknown) {
  if (cache.has(key)) {
    // If updating existing key, delete first to refresh position
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest (first inserted)
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }

  cache.set(key, {
    data,
    expires: Date.now() + CACHE_TTL,
  });
}

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

export async function searchBooks(
  query: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const cacheKey = `search:${query}:${page}`;
  const cached = getFromCache<{ results: UnifiedMedia[]; totalResults: number }>(cacheKey);
  if (cached) return cached;

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
    const data = GoogleBooksResponseSchema.parse(rawData);

    const results = (data.items || []).map((item) => ({
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

    const result = {
      results,
      totalResults: data.totalItems || 0,
    };

    setInCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error("Google Books API Error", e);
    return { results: [], totalResults: 0 };
  }
}

export async function getBookDetails(id: string) {
  const cacheKey = `details:${id}`;
  const cached = getFromCache<UnifiedMedia>(cacheKey);
  if (cached) return cached;

  try {
    const apiKey = getGoogleBooksApiKey();
    const url = new URL(`https://www.googleapis.com/books/v1/volumes/${id}`);
    url.search = new URLSearchParams({
      key: apiKey,
    }).toString();

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Failed to fetch book details");

    const item = await res.json();
    const data = GoogleBookItemSchema.parse(item);

    const result = {
      id: data.id,
      mediaType: "book" as const,
      source: "google_books" as const,
      title: data.volumeInfo.title || "Unknown Title",
      poster:
        data.volumeInfo.imageLinks?.thumbnail
          ?.replace("http:", "https:")
          .replace("&zoom=1", "&zoom=0")
          .replace("&edge=curl", "") || null,
      year: data.volumeInfo.publishedDate?.split("-")[0],
      releaseDate: data.volumeInfo.publishedDate,
      rating: data.volumeInfo.averageRating ? data.volumeInfo.averageRating * 2 : undefined,
      overview: data.volumeInfo.description,
    };

    setInCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error("Google Books Details Error", e);
    throw e;
  }
}
