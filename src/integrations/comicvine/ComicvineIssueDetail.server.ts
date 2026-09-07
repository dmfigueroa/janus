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

const ComicVineIssueDetailResponseSchema = z.object({
  error: z.string(),
  results: ComicVineIssueDetailSchema,
});

export type ComicIssueDetail = ComicIssue & {
  parent: { id: string; title: string | null };
};

export async function getComicIssue(issueId: string, apiKey: string): Promise<ComicIssueDetail> {
  const url = new URL(`https://comicvine.gamespot.com/api/issue/4000-${issueId}/`);
  url.search = new URLSearchParams({
    api_key: apiKey,
    format: "json",
  }).toString();
  const response = await fetch(url, {
    headers: { "User-Agent": "JanusApp/1.0" },
  });
  if (!response.ok) throw new Error(`ComicVine issue request failed: ${response.status}`);

  const data = ComicVineIssueDetailResponseSchema.parse(await response.json());
  if (data.error !== "OK") throw new Error(`ComicVine issue response: ${data.error}`);

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
