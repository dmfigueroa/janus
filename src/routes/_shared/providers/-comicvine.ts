import { Effect } from "effect";
import pLimit from "p-limit";
import { z } from "zod";
import { API_PAGE_SIZE } from "../-constants";
import { type UnifiedMedia } from "../-media";
import { fetchJson, parseWithSchema, runServerEffect } from "../-effect";

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

const COMICVINE_ISSUES_URL = "https://comicvine.gamespot.com/api/issues/";
const COMICVINE_SEARCH_URL = "https://comicvine.gamespot.com/api/search/";
const COMICVINE_ISSUE_FIELDS = "id,name,issue_number,image,cover_date,description,deck";
const COMICVINE_ISSUE_PAGE_LIMIT = 100;
const COMICVINE_MAX_CONCURRENCY = 5;
const COMICVINE_DEFAULT_CONCURRENCY = 3;
const COMICVINE_RETRIES = 2;
const COMICVINE_RETRY_BASE_DELAY_MS = 250;
const COMICVINE_API_ERROR = "ComicVine API Error";
const COMICVINE_ISSUES_API_ERROR = "ComicVine Issues API Error";
const COMICVINE_ISSUES_SEARCH_ERROR = "ComicVine Issues API Search Error";

type ComicIssueSortDirection = "asc" | "desc";
type ComicIssueItem = z.infer<typeof ComicIssueItemSchema>;
type ComicIssueResponse = z.infer<typeof ComicIssueResponseSchema>;
type ComicVineVolume = z.infer<typeof ComicVineVolumeSchema>;

type GetComicIssuesOptions = {
  knownIssueIds?: Set<string>;
  concurrency?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildIssuePageUrl(
  volumeId: string,
  apiKey: string,
  offset: number,
  direction: ComicIssueSortDirection,
): URL {
  const url = new URL(COMICVINE_ISSUES_URL);
  url.search = new URLSearchParams({
    api_key: apiKey,
    filter: `volume:${volumeId}`,
    sort: `issue_number:${direction}`,
    field_list: COMICVINE_ISSUE_FIELDS,
    format: "json",
    limit: COMICVINE_ISSUE_PAGE_LIMIT.toString(),
    offset: offset.toString(),
  }).toString();

  return url;
}

async function fetchIssuePage(
  volumeId: string,
  apiKey: string,
  offset: number,
  direction: ComicIssueSortDirection,
): Promise<ComicIssueResponse> {
  const program = Effect.gen(function* () {
    const url = buildIssuePageUrl(volumeId, apiKey, offset, direction);
    const rawData = yield* fetchJson({
      url,
      init: {
        headers: {
          "User-Agent": "JanusApp/1.0",
        },
      },
      context: COMICVINE_ISSUES_API_ERROR,
    });
    const data = yield* parseWithSchema(
      ComicIssueResponseSchema,
      rawData,
      COMICVINE_ISSUES_API_ERROR,
    );

    if (data.error !== "OK") {
      return yield* Effect.fail(
        new Error(`${COMICVINE_ISSUES_API_ERROR}: Response: ${data.error}`),
      );
    }

    return data;
  });

  return runServerEffect(program);
}

async function fetchIssuePageWithRetry(
  volumeId: string,
  apiKey: string,
  offset: number,
  direction: ComicIssueSortDirection,
  retries = COMICVINE_RETRIES,
): Promise<ComicIssueResponse> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchIssuePage(volumeId, apiKey, offset, direction);
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await sleep(COMICVINE_RETRY_BASE_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error("Failed to fetch issues page");
}

function mapIssueToComicIssue(issue: ComicIssueItem): ComicIssue {
  return {
    id: issue.id.toString(),
    mediaType: "comic",
    source: "comicvine",
    title: issue.name || `Issue #${issue.issue_number}`,
    poster: issue.image?.medium_url ?? issue.image?.small_url ?? null,
    coverDate: issue.cover_date ?? null,
    issueNumber: issue.issue_number ?? null,
    description: issue.description ?? issue.deck ?? null,
  };
}

function mapVolumeToUnifiedMedia(item: ComicVineVolume): UnifiedMedia {
  return {
    id: item.id.toString(),
    mediaType: "comic",
    source: "comicvine",
    title: item.name || "Unknown Title",
    poster: item.image?.medium_url ?? item.image?.small_url ?? null,
    year: item.start_year ?? undefined,
    rating: undefined,
    overview: item.deck ?? item.description ?? undefined,
  };
}

async function collectAllVolumeIssues(
  volumeId: string,
  apiKey: string,
  concurrency: number,
): Promise<ComicIssueItem[]> {
  const firstPage = await fetchIssuePageWithRetry(volumeId, apiKey, 0, "asc");
  const allIssues = [...firstPage.results];
  const totalResults = firstPage.number_of_total_results;

  if (firstPage.results.length === 0 || firstPage.results.length >= totalResults) {
    return allIssues;
  }

  const offsets: number[] = [];
  for (
    let offset = firstPage.results.length;
    offset < totalResults;
    offset += COMICVINE_ISSUE_PAGE_LIMIT
  ) {
    offsets.push(offset);
  }

  const pageLimit = pLimit(concurrency);
  const remainingPages = await Promise.all(
    offsets.map((offset) =>
      pageLimit(async () => {
        const data = await fetchIssuePageWithRetry(volumeId, apiKey, offset, "asc");
        return { offset, results: data.results };
      }),
    ),
  );

  remainingPages
    .sort((a, b) => a.offset - b.offset)
    .forEach((page) => {
      allIssues.push(...page.results);
    });

  return allIssues;
}

async function collectNewVolumeIssues(
  volumeId: string,
  apiKey: string,
  knownIssueIds: Set<string>,
): Promise<ComicIssueItem[]> {
  const newIssues: ComicIssueItem[] = [];
  let offset = 0;
  let totalResults = 1;

  while (offset < totalResults) {
    const data = await fetchIssuePageWithRetry(volumeId, apiKey, offset, "desc");
    totalResults = data.number_of_total_results;

    if (data.results.length === 0) {
      break;
    }

    let newIssuesInPage = 0;

    for (const issue of data.results) {
      const issueId = issue.id.toString();
      if (knownIssueIds.has(issueId)) {
        continue;
      }
      newIssues.push(issue);
      newIssuesInPage += 1;
    }

    if (newIssuesInPage === 0) {
      break;
    }

    offset += data.results.length;
  }

  return newIssues;
}

export async function searchComics(
  query: string,
  apiKey: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const program = Effect.gen(function* () {
    const limit = API_PAGE_SIZE;
    const url = new URL(COMICVINE_SEARCH_URL);
    url.search = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      resources: "volume",
      query,
      page: page.toString(),
      limit: limit.toString(),
    }).toString();

    const rawData = yield* fetchJson({
      url,
      init: {
        headers: {
          "User-Agent": "JanusApp/1.0",
        },
      },
      context: COMICVINE_API_ERROR,
    }).pipe(Effect.catchAll(() => Effect.succeed({ results: [], number_of_total_results: 0 })));
    const data = yield* parseWithSchema(ComicVineResponseSchema, rawData, COMICVINE_API_ERROR);

    const results = (data.results ?? []).map(mapVolumeToUnifiedMedia);

    return {
      results,
      totalResults: data.number_of_total_results ?? 0,
    };
  });

  return runServerEffect(program);
}

export async function getComicIssues(
  volumeId: string,
  apiKey: string,
  options: GetComicIssuesOptions = {},
): Promise<ComicIssue[]> {
  const knownIssueIds = options.knownIssueIds;
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? COMICVINE_DEFAULT_CONCURRENCY, COMICVINE_MAX_CONCURRENCY),
  );
  const program = Effect.tryPromise({
    try: async () => {
      const issues = knownIssueIds?.size
        ? await collectNewVolumeIssues(volumeId, apiKey, knownIssueIds)
        : await collectAllVolumeIssues(volumeId, apiKey, concurrency);

      return issues.map(mapIssueToComicIssue);
    },
    catch: (error: unknown) => new Error(`${COMICVINE_ISSUES_SEARCH_ERROR}: ${String(error)}`),
  });

  return runServerEffect(program);
}
