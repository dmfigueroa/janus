import { comicVineIdSchema } from "@/integrations/ProviderIds";
import { parseComicVineResponse } from "@/integrations/comicvine/ParseComicVineResponse.server";
import { requestProviderJson } from "@/integrations/ProviderRequest.server";
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
  results: z.array(ComicIssueItemSchema),
  number_of_total_results: z.number(),
});

const COMICVINE_ISSUES_URL = "https://comicvine.gamespot.com/api/issues/";
const COMICVINE_ISSUE_FIELDS = "id,name,issue_number,image,cover_date,description,deck";
export const COMICVINE_ISSUE_PAGE_LIMIT = 100;

type ComicIssueSortDirection = "asc" | "desc";
export type ComicIssueItem = z.infer<typeof ComicIssueItemSchema>;
type ComicIssueResponse = z.infer<typeof ComicIssueResponseSchema>;

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

export async function fetchIssuePage(
  volumeId: string,
  apiKey: string,
  offset: number,
  direction: ComicIssueSortDirection,
  signal?: AbortSignal,
): Promise<ComicIssueResponse> {
  const parsedVolumeId = comicVineIdSchema.parse(volumeId);
  const context = { provider: "comicvine", operation: "fetch_issue_page" };
  const url = buildIssuePageUrl(parsedVolumeId, apiKey, offset, direction);
  const rawData = await requestProviderJson(
    url,
    {
      headers: { "User-Agent": "JanusApp/1.0" },
      signal,
    },
    context,
  );
  return parseComicVineResponse(ComicIssueResponseSchema, rawData, context);
}
