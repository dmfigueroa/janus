import { z } from "zod";

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
const COMICVINE_ISSUE_FIELDS = "id,name,issue_number,image,cover_date,description,deck";
export const COMICVINE_ISSUE_PAGE_LIMIT = 100;
const COMICVINE_RETRIES = 2;
const COMICVINE_RETRY_BASE_DELAY_MS = 250;

type ComicIssueSortDirection = "asc" | "desc";
export type ComicIssueItem = z.infer<typeof ComicIssueItemSchema>;
type ComicIssueResponse = z.infer<typeof ComicIssueResponseSchema>;

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
  const url = buildIssuePageUrl(volumeId, apiKey, offset, direction);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "JanusApp/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Status ${res.status}: ${res.statusText}`);
  }

  const rawData = await res.json();
  const data = ComicIssueResponseSchema.parse(rawData);

  if (data.error !== "OK") {
    throw new Error(`Response: ${data.error}`);
  }

  return data;
}

async function fetchIssuePageAttempt(
  volumeId: string,
  apiKey: string,
  offset: number,
  direction: ComicIssueSortDirection,
  attempt: number,
  retries: number,
) {
  try {
    return await fetchIssuePage(volumeId, apiKey, offset, direction);
  } catch (error) {
    if (attempt >= retries) throw error;
    await sleep(COMICVINE_RETRY_BASE_DELAY_MS * (attempt + 1));
  }
}

async function fetchIssuePagesWithRetry(
  volumeId: string,
  apiKey: string,
  offset: number,
  direction: ComicIssueSortDirection,
  retries: number,
): Promise<ComicIssueResponse> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchIssuePageAttempt(
      volumeId,
      apiKey,
      offset,
      direction,
      attempt,
      retries,
    );
    if (response) return response;
  }

  throw new Error("Failed to fetch issues page");
}

export async function fetchIssuePageWithRetry(
  volumeId: string,
  apiKey: string,
  offset: number,
  direction: ComicIssueSortDirection,
  retries = COMICVINE_RETRIES,
): Promise<ComicIssueResponse> {
  return fetchIssuePagesWithRetry(volumeId, apiKey, offset, direction, retries);
}
