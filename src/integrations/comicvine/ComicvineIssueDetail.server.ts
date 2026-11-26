import { comicVineIdSchema, providerResourceUrl } from "@/integrations/ProviderIds";
import { parseComicVineResponse } from "@/integrations/comicvine/ParseComicVineResponse.server";
import { requestProviderJson } from "@/integrations/ProviderRequest.server";
import { z } from "zod";
import {
  mapIssueToComicIssue,
  type ComicIssue,
} from "@/server/providers/ComicvineIssueMapping.server";

const ComicVineIssueDetailSchema = z.object({
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
  volume: z.object({ id: z.number(), name: z.string().nullable().optional() }),
});

const comicVineIssueDetailResponseSchema = z.object({
  results: ComicVineIssueDetailSchema,
});

export type ComicIssueDetail = ComicIssue & {
  parent: { id: string; title: string | null };
};

export async function getComicIssue(
  issueId: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ComicIssueDetail> {
  const parsedIssueId = comicVineIdSchema.parse(issueId);
  const url = providerResourceUrl({
    prefix: "https://comicvine.gamespot.com/api/issue/",
    segment: `4000-${parsedIssueId}`,
    searchParams: new URLSearchParams({ api_key: apiKey, format: "json" }),
    trailingSlash: true,
  });
  const context = { provider: "comicvine", operation: "get_issue_details" };
  const rawData = await requestProviderJson(
    url,
    {
      headers: { "User-Agent": "JanusApp/1.0" },
      signal,
    },
    context,
  );
  const data = parseComicVineResponse(comicVineIssueDetailResponseSchema, rawData, context);

  return {
    ...mapIssueToComicIssue(data.results),
    parent: mapIssueParent(data.results),
  };
}

function mapIssueParent(
  issue: z.infer<typeof ComicVineIssueDetailSchema>,
): ComicIssueDetail["parent"] {
  return {
    id: issue.volume.id.toString(),
    title: issue.volume.name ?? null,
  };
}
