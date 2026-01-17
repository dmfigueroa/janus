import { z } from "zod";
import { API_PAGE_SIZE } from "./constants";
import { type UnifiedMedia } from "./media";

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
  start_year: z.string().optional(),
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

export async function searchComics(
  query: string,
  apiKey: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
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
    const data = ComicVineResponseSchema.parse(rawData);

    const results = (data.results || []).map((item) => ({
      id: item.id.toString(),
      mediaType: "comic" as const,
      source: "comicvine" as const,
      title: item.name || "Unknown Title",
      poster: item.image?.medium_url || item.image?.small_url || null,
      year: item.start_year,
      rating: undefined,
      overview: item.deck || item.description || undefined,
    }));

    return {
      results,
      totalResults: data.number_of_total_results || 0,
    };
  } catch (e) {
    console.error("ComicVine API Error", e);
    return { results: [], totalResults: 0 };
  }
}

export async function getComicIssues(volumeId: string, apiKey: string): Promise<ComicIssue[]> {
  const allIssues: z.infer<typeof ComicIssueItemSchema>[] = [];
  let offset = 0;
  let totalResults = 1;
  const limit = 100;

  try {
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
        console.error(`ComicVine API Error (Status ${res.status}): ${res.statusText}`);
        break;
      }

      const rawData = await res.json();
      const data = ComicIssueResponseSchema.parse(rawData);

      if (data.error !== "OK") {
        console.error(`ComicVine API Error (Response): ${data.error}`);
        break;
      }

      const results = data.results;
      allIssues.push(...results);

      totalResults = data.number_of_total_results;
      offset += results.length;

      console.log(`Fetched ${results.length} issues (Total: ${allIssues.length}/${totalResults})`);

      if (results.length === 0) break;
    }

    return allIssues.map((issue) => ({
      id: issue.id.toString(),
      mediaType: "comic",
      source: "comicvine",
      title: issue.name || `Issue #${issue.issue_number}`,
      poster: issue.image?.medium_url || issue.image?.small_url || null,
      coverDate: issue.cover_date || null,
      issueNumber: issue.issue_number || null,
      description: issue.description || issue.deck || null,
    }));
  } catch (e) {
    console.error("ComicVine Issues API Search Error", e);
    return [];
  }
}
