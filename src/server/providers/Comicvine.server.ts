import { z } from "zod";
import pLimit from "p-limit";
import {
  parseProviderData,
  requestProviderJson,
  rethrowProviderFailure,
} from "@/integrations/ProviderRequest.server";
import { API_PAGE_SIZE } from "../Constants";
import { type UnifiedMedia } from "../Media";
import { getErrorMessage } from "../Utils";
import {
  COMICVINE_ISSUE_PAGE_LIMIT,
  fetchIssuePage,
  type ComicIssueItem,
} from "./ComicvineIssuePages.server";
import { mapIssueToComicIssue, type ComicIssue } from "./ComicvineIssueMapping.server";
export { ComicIssueSchema, type ComicIssue } from "./ComicvineIssueMapping.server";
type ComicVineVolume = z.infer<typeof ComicVineVolumeSchema>;

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

const COMICVINE_MAX_CONCURRENCY = 5,
  COMICVINE_DEFAULT_CONCURRENCY = 3;

type GetComicIssuesOptions = {
  knownIssueIds?: Set<string>;
  concurrency?: number;
  signal?: AbortSignal;
};

const getVolumeImage = (item: ComicVineVolume) =>
  getVolumeMediumImage(item) || getVolumeSmallImage(item);
const getVolumeMediumImage = (item: ComicVineVolume) => item.image?.medium_url;
const getVolumeSmallImage = (item: ComicVineVolume) => item.image?.small_url;
const getVolumePoster = (item: ComicVineVolume) => getVolumeImage(item) || null;
const getVolumeOverview = (item: ComicVineVolume) => item.deck || item.description || undefined;

function mapVolume(item: ComicVineVolume): UnifiedMedia {
  return {
    id: item.id.toString(),
    mediaType: "comic",
    source: "comicvine",
    title: item.name || "Unknown Title",
    poster: getVolumePoster(item),
    year: item.start_year || undefined,
    rating: undefined,
    overview: getVolumeOverview(item),
  };
}

function formatComicSearch(data: z.infer<typeof ComicVineResponseSchema>) {
  return {
    results: (data.results || []).map(mapVolume),
    totalResults: data.number_of_total_results || 0,
  };
}

function buildIssueOffsets(firstOffset: number, totalResults: number) {
  const offsets: number[] = [];
  for (let offset = firstOffset; offset < totalResults; offset += COMICVINE_ISSUE_PAGE_LIMIT) {
    offsets.push(offset);
  }
  return offsets;
}

async function collectAllVolumeIssues(
  volumeId: string,
  apiKey: string,
  concurrency: number,
  signal?: AbortSignal,
): Promise<ComicIssueItem[]> {
  const firstPage = await fetchIssuePage(volumeId, apiKey, 0, "asc", signal);
  const allIssues = [...firstPage.results];
  const totalResults = firstPage.number_of_total_results;

  if (firstPage.results.length === 0 || firstPage.results.length >= totalResults) {
    return allIssues;
  }

  const offsets = buildIssueOffsets(firstPage.results.length, totalResults);

  const pageLimit = pLimit(concurrency);
  const remainingPages = await Promise.all(
    offsets.map((offset) =>
      pageLimit(async () => {
        const data = await fetchIssuePage(volumeId, apiKey, offset, "asc", signal);
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

function appendNewIssues(
  issues: ComicIssueItem[],
  knownIssueIds: Set<string>,
  newIssues: ComicIssueItem[],
) {
  const issuesToAppend = issues.filter((issue) => !knownIssueIds.has(issue.id.toString()));
  newIssues.push(...issuesToAppend);
}

async function collectNewVolumeIssues(
  volumeId: string,
  apiKey: string,
  knownIssueIds: Set<string>,
  signal?: AbortSignal,
): Promise<ComicIssueItem[]> {
  const newIssues: ComicIssueItem[] = [];
  let offset = 0;
  let totalResults = 1;

  while (offset < totalResults) {
    const data = await fetchIssuePage(volumeId, apiKey, offset, "desc", signal);
    totalResults = data.number_of_total_results;

    if (data.results.length === 0) break;
    appendNewIssues(data.results, knownIssueIds, newIssues);

    offset += data.results.length;
  }

  return newIssues;
}

async function searchComicsRequest(
  query: string,
  apiKey: string,
  page: number,
  signal?: AbortSignal,
) {
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

  const rawData = await requestProviderJson(url.toString(), {
    headers: { "User-Agent": "JanusApp/1.0" },
    signal,
  });
  const data = parseProviderData(ComicVineResponseSchema, rawData);
  return formatComicSearch(data);
}

export async function searchComics(
  query: string,
  apiKey: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
    return await searchComicsRequest(query, apiKey, page, signal);
  } catch (error) {
    console.error("ComicVine API Error:", getErrorMessage(error));
    rethrowProviderFailure(error, "ComicVine API Error");
  }
}

function getComicIssueConcurrency(options: GetComicIssuesOptions) {
  return Math.max(
    1,
    Math.min(options.concurrency ?? COMICVINE_DEFAULT_CONCURRENCY, COMICVINE_MAX_CONCURRENCY),
  );
}

async function collectVolumeIssues(
  volumeId: string,
  apiKey: string,
  knownIssueIds: Set<string> | undefined,
  concurrency: number,
  signal?: AbortSignal,
) {
  if (knownIssueIds?.size) return collectNewVolumeIssues(volumeId, apiKey, knownIssueIds, signal);
  return collectAllVolumeIssues(volumeId, apiKey, concurrency, signal);
}

export async function getComicIssues(
  volumeId: string,
  apiKey: string,
  options: GetComicIssuesOptions = {},
): Promise<ComicIssue[]> {
  const knownIssueIds = options.knownIssueIds;
  const concurrency = getComicIssueConcurrency(options);
  const issues = await collectVolumeIssues(
    volumeId,
    apiKey,
    knownIssueIds,
    concurrency,
    options.signal,
  );
  return issues.map(mapIssueToComicIssue);
}
