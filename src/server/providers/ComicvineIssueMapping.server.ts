import { z } from "zod";
import type { ComicIssueItem } from "./ComicvineIssuePages.server";

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

const getIssueTitle = (issue: ComicIssueItem) => issue.name || `Issue #${issue.issue_number}`;
const getIssueMediumImage = (issue: ComicIssueItem) => issue.image?.medium_url;
const getIssueSmallImage = (issue: ComicIssueItem) => issue.image?.small_url;
const getIssueImage = (issue: ComicIssueItem) =>
  getIssueMediumImage(issue) || getIssueSmallImage(issue);
const getIssuePoster = (issue: ComicIssueItem) => getIssueImage(issue) || null;
const getIssueDescription = (issue: ComicIssueItem) => issue.description || issue.deck || null;

export function mapIssueToComicIssue(issue: ComicIssueItem): ComicIssue {
  return {
    id: issue.id.toString(),
    mediaType: "comic",
    source: "comicvine",
    title: getIssueTitle(issue),
    poster: getIssuePoster(issue),
    coverDate: issue.cover_date || null,
    issueNumber: issue.issue_number || null,
    description: getIssueDescription(issue),
  };
}
