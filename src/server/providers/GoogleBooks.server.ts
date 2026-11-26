import { googleBooksIdSchema, providerResourceUrl } from "@/integrations/ProviderIds";
import {
  ProviderRequestError,
  requestProviderJson,
  parseProviderData,
  rethrowProviderFailure,
} from "@/integrations/ProviderRequest.server";
import { z } from "zod";
import { API_PAGE_SIZE } from "../Constants";
import { type UnifiedMedia } from "../Media";
import { logMissingProviderConfiguration } from "@/integrations/ProviderLogging.server";

const GoogleBookItemSchema = z.object({
  id: z.string(),
  volumeInfo: z.object({
    title: z.string().optional(),
    authors: z.array(z.string()).optional(),
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

type GoogleBookItem = z.infer<typeof GoogleBookItemSchema>;

function getBookThumbnail(item: GoogleBookItem) {
  return item.volumeInfo.imageLinks?.thumbnail;
}

function getBookPoster(item: GoogleBookItem) {
  const thumbnail = getBookThumbnail(item);
  if (!thumbnail) return null;
  return thumbnail
    .replace("http:", "https:")
    .replace("&zoom=1", "&zoom=0")
    .replace("&edge=curl", "");
}

function getBookRating(rating: number | undefined) {
  return rating ? rating * 2 : undefined;
}

function mapBook(item: GoogleBookItem): UnifiedMedia & { mediaType: "book" } {
  return {
    id: item.id,
    mediaType: "book",
    source: "google_books",
    title: item.volumeInfo.title || "Unknown Title",
    poster: getBookPoster(item),
    year: item.volumeInfo.publishedDate?.split("-")[0],
    releaseDate: item.volumeInfo.publishedDate,
    rating: getBookRating(item.volumeInfo.averageRating),
    overview: item.volumeInfo.description,
    authors: item.volumeInfo.authors,
  };
}

function formatBookSearch(data: z.infer<typeof GoogleBooksResponseSchema>) {
  return {
    results: (data.items || []).map(mapBook),
    totalResults: data.totalItems || 0,
  };
}

const getGoogleBooksApiKey = (operation: string) => {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    logMissingProviderConfiguration("google_books", operation);
    throw new ProviderRequestError("provider_not_configured");
  }
  return apiKey;
};

async function searchBooksRequest(query: string, page: number, signal?: AbortSignal) {
  const context = { provider: "google_books", operation: "search_books" };
  const apiKey = getGoogleBooksApiKey(context.operation);
  const maxResults = API_PAGE_SIZE;
  const startIndex = (page - 1) * maxResults;
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.search = new URLSearchParams({
    q: query,
    startIndex: startIndex.toString(),
    maxResults: maxResults.toString(),
    key: apiKey,
  }).toString();

  const rawData = await requestProviderJson(url.toString(), { signal }, context);
  const data = parseProviderData(GoogleBooksResponseSchema, rawData, context);
  return formatBookSearch(data);
}

async function getBookDetailsRequest(id: string, signal?: AbortSignal) {
  const bookId = googleBooksIdSchema.parse(id);
  const context = { provider: "google_books", operation: "get_book_details" };
  const apiKey = getGoogleBooksApiKey(context.operation);
  const url = providerResourceUrl({
    prefix: "https://www.googleapis.com/books/v1/volumes/",
    segment: bookId,
    searchParams: new URLSearchParams({ key: apiKey }),
  });

  const item = await requestProviderJson(url.toString(), { signal }, context);
  return mapBook(parseProviderData(GoogleBookItemSchema, item, context));
}

export async function searchBooks(
  query: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
    return await searchBooksRequest(query, page, signal);
  } catch (error) {
    rethrowProviderFailure(error, "Google Books API Error", {
      provider: "google_books",
      operation: "search_books",
    });
  }
}

export async function getBookDetails(id: string, signal?: AbortSignal) {
  return getBookDetailsRequest(id, signal);
}
