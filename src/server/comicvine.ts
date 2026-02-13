"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { consola } from "consola";
import { API_PAGE_SIZE } from "./constants";
import { type UnifiedMedia, UnifiedMediaSchema } from "./media";
import { CacheService } from "@/utils/cache";

export const ComicIssueSchema = z.object({
  id: z.string(),
  mediaType: z.literal("comic"),
  source: z.literal("comicvine"),
  title: z.string(),
  poster: z.string().nullable(),
  coverDate: z.string().nullable(),
  issueNumber: z.string().nullable(),
  description: z.string().nullable(),
});

export type ComicIssue = z.infer<typeof ComicIssueSchema>;

const ComicVineVolumeSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  image: z
    .object({
      medium_url: z.string().nullable().optional(),
      small_url: z.string().nullable().optional(),
    })
    .optional(),
  start_year: z.string().nullable().optional(),
  deck: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const ComicVineResponseSchema = z.object({
  results: z.array(ComicVineVolumeSchema).optional(),
  number_of_total_results: z.number().optional(),
});

const ComicIssueItemSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  issue_number: z.string().nullable().optional(),
  image: z
    .object({
      medium_url: z.string().nullable().optional(),
      small_url: z.string().nullable().optional(),
    })
    .optional(),
  cover_date: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  deck: z.string().nullable().optional(),
});

const ComicIssueResponseSchema = z.object({
  error: z.string(),
  results: z.array(ComicIssueItemSchema).default([]),
  number_of_total_results: z.number().default(0),
});

const getComicVineApiKey = () => {
  const apiKey = process.env.COMICVINE_API_KEY;
  if (!apiKey) throw new Error("COMICVINE_API_KEY is not configured");
  return apiKey;
};

const SearchComicsResponseSchema = z.object({
  results: z.array(UnifiedMediaSchema),
  totalResults: z.number(),
});

export async function searchComicsInternal(data: {
  query: string;
  page: number;
  forceRefresh?: boolean;
}): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const { query, page, forceRefresh } = data;
  const cacheKey = `comicvine-search-${query}-${page}`;

  return CacheService.withCache(
    cacheKey,
    "comicvine",
    async () => {
      try {
        const apiKey = getComicVineApiKey();
        const limit = API_PAGE_SIZE;
        const url = new URL("https://comicvine.gamespot.com/api/search/");
        url.search = new URLSearchParams({
          api_key: apiKey,
          format: "json",
          resources: "volume",
          query: query,
          page: page.toString(),
          limit: limit.toString(),
        }).toString();

        const res = await fetch(url.toString(), {
          headers: {
            "User-Agent": "JanusApp/1.0",
          },
        });

        if (!res.ok) return { results: [], totalResults: 0 };

        const rawData = await res.json();
        const parsedData = ComicVineResponseSchema.parse(rawData);

        const results: UnifiedMedia[] = (parsedData.results || []).map((item) => ({
          id: item.id.toString(),
          mediaType: "comic" as const,
          source: "comicvine" as const,
          title: item.name || "Unknown Title",
          poster: item.image?.medium_url || item.image?.small_url || null,
          year: item.start_year || undefined,
          rating: undefined,
          overview: item.deck || item.description || undefined,
        }));

        return {
          results,
          totalResults: parsedData.number_of_total_results || 0,
        };
      } catch (e) {
        consola.error("ComicVine API Error", e);
        return { results: [], totalResults: 0 };
      }
    },
    SearchComicsResponseSchema,
    { forceRefresh },
  );
}

export const searchComics = createServerFn({ method: "GET" })
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
    return searchComicsInternal(data);
  });

export async function getComicIssuesInternal(data: {
  volumeId: string;
  forceRefresh?: boolean;
}): Promise<ComicIssue[]> {
  const { volumeId, forceRefresh } = data;
  const cacheKey = `comicvine-issues-${volumeId}`;

  return CacheService.withCache(
    cacheKey,
    "comicvine",
    async () => {
      const allIssues: z.infer<typeof ComicIssueItemSchema>[] = [];
      let offset = 0;
      let totalResults = 1;
      const limit = 100;

      try {
        const apiKey = getComicVineApiKey();
        while (offset < totalResults) {
          const url = new URL("https://comicvine.gamespot.com/api/issues/");
          url.search = new URLSearchParams({
            api_key: apiKey,
            filter: `volume:${volumeId}`,
            sort: "issue_number:asc",
            format: "json",
            limit: limit.toString(),
            offset: offset.toString(),
          }).toString();

          const res = await fetch(url, {
            headers: {
              "User-Agent": "JanusApp/1.0",
            },
          });

          if (!res.ok) {
              consola.error(`ComicVine API Error (Status ${res.status}): ${res.statusText}`);
            break;
          }

          const rawData = await res.json();
          const parsedData = ComicIssueResponseSchema.parse(rawData);

          if (parsedData.error !== "OK") {
              consola.error(`ComicVine API Error (Response): ${parsedData.error}`);
            break;
          }

          const results = parsedData.results;
          allIssues.push(...results);

          totalResults = parsedData.number_of_total_results;
          offset += results.length;

          if (results.length === 0) break;
        }

        return allIssues.map((issue) => ({
          id: issue.id.toString(),
          mediaType: "comic" as const,
          source: "comicvine" as const,
          title: issue.name || `Issue #${issue.issue_number}`,
          poster: issue.image?.medium_url || issue.image?.small_url || null,
          coverDate: issue.cover_date || null,
          issueNumber: issue.issue_number || null,
          description: issue.description || issue.deck || null,
        }));
      } catch (e) {
          consola.error("ComicVine Issues API Search Error", e);
        return [];
      }
    },
    z.array(ComicIssueSchema),
    { forceRefresh },
  );
}

export const getComicIssues = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        volumeId: z.string(),
        forceRefresh: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return getComicIssuesInternal(data);
  });
