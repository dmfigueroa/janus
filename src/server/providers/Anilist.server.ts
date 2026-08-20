import { z } from "zod";
import { API_PAGE_SIZE } from "../Constants";
import { type UnifiedMedia } from "../Media";
import { getErrorMessage } from "../Utils";
import { ANILIST_DETAILS_QUERY, ANILIST_SEARCH_QUERY } from "./AnilistQueries.server";

const AniListMediaSchema = z.object({
  id: z.number(),
  title: z.object({
    romaji: z.string().nullable().optional(),
    english: z.string().nullable().optional(),
    native: z.string().nullable().optional(),
  }),
  type: z.enum(["ANIME", "MANGA"]),
  format: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  startDate: z
    .object({
      year: z.number().nullable().optional(),
      month: z.number().nullable().optional(),
      day: z.number().nullable().optional(),
    })
    .optional(),
  averageScore: z.number().nullable().optional(),
  bannerImage: z.string().nullable().optional(),
  coverImage: z
    .object({
      large: z.string().nullable().optional(),
      extraLarge: z.string().nullable().optional(),
    })
    .optional(),
  episodes: z.number().nullable().optional(),
  chapters: z.number().nullable().optional(),
  volumes: z.number().nullable().optional(),
});

const AniListResponseSchema = z.object({
  data: z.object({
    Page: z.object({
      pageInfo: z.object({
        total: z.number().optional(),
        perPage: z.number().optional(),
        currentPage: z.number().optional(),
        lastPage: z.number().optional(),
        hasNextPage: z.boolean().optional(),
      }),
      media: z.array(AniListMediaSchema),
    }),
  }),
});

const AniListDetailsResponseSchema = z.object({
  data: z.object({
    Media: AniListMediaSchema,
  }),
});

type AniListMedia = z.infer<typeof AniListMediaSchema>;
type AniListStartDate = AniListMedia["startDate"];

const getAniListMediaType = (type: AniListMedia["type"]) =>
  type === "ANIME" ? ("anime" as const) : ("manga" as const);
const getAniListTitle = (item: AniListMedia) =>
  item.title.english || item.title.romaji || "Unknown Title";
const getAniListExtraLargeImage = (item: AniListMedia) => item.coverImage?.extraLarge;
const getAniListLargeImage = (item: AniListMedia) => item.coverImage?.large;
const getAniListPoster = (item: AniListMedia) =>
  getAniListExtraLargeImage(item) || getAniListLargeImage(item) || null;
const getAniListYear = (startDate: AniListStartDate) => startDate?.year?.toString();
const getAniListRating = (score: number | null | undefined) => (score ? score / 10 : undefined);
const getDatePart = (value: number | null | undefined) => (value || 1).toString().padStart(2, "0");

function getAniListReleaseDate(startDate: AniListStartDate) {
  if (!startDate?.year) return undefined;
  return `${startDate.year}-${getDatePart(startDate.month)}-${getDatePart(startDate.day)}`;
}

function mapAniListMedia(item: AniListMedia): UnifiedMedia {
  return {
    id: item.id.toString(),
    mediaType: getAniListMediaType(item.type),
    source: "anilist",
    title: getAniListTitle(item),
    poster: getAniListPoster(item),
    backdrop: item.bannerImage || null,
    year: getAniListYear(item.startDate),
    rating: getAniListRating(item.averageScore),
    overview: item.description || undefined,
  };
}

function mapAniListDetails(item: AniListMedia) {
  return {
    id: item.id.toString(),
    mediaType: getAniListMediaType(item.type),
    source: "anilist" as const,
    title: getAniListTitle(item),
    poster: getAniListPoster(item),
    backdrop: item.bannerImage || null,
    year: getAniListYear(item.startDate),
    releaseDate: getAniListReleaseDate(item.startDate),
    rating: getAniListRating(item.averageScore),
    overview: item.description || undefined,
    episodes: item.episodes,
    chapters: item.chapters,
    volumes: item.volumes,
  };
}

const getAniListTotal = (total: number | undefined) => total || 0;

const ANILIST_URL = "https://graphql.anilist.co";

async function fetchAniList(query: string, variables: Record<string, unknown>) {
  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      `AniList API Error: ${response.status} ${response.statusText} ${JSON.stringify(errorData)}`,
    );
  }

  return response.json();
}

export async function searchAnilistInternal(
  query: string,
  type: "ANIME" | "MANGA",
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
    const rawData = await fetchAniList(ANILIST_SEARCH_QUERY, {
      search: query,
      type,
      page,
      perPage: API_PAGE_SIZE,
    });

    const data = AniListResponseSchema.parse(rawData);
    const results: UnifiedMedia[] = data.data.Page.media.map(mapAniListMedia);

    return {
      results,
      totalResults: getAniListTotal(data.data.Page.pageInfo.total),
    };
  } catch (e) {
    const errorMessage = getErrorMessage(e);
    console.error("AniList Search Error:", errorMessage);
    throw new Error(`AniList Search Error: ${errorMessage}`);
  }
}

export async function getAnilistDetailsInternal(id: string) {
  try {
    const rawData = await fetchAniList(ANILIST_DETAILS_QUERY, { id: parseInt(id) });
    const data = AniListDetailsResponseSchema.parse(rawData);
    return mapAniListDetails(data.data.Media);
  } catch (e) {
    const errorMessage = getErrorMessage(e);
    console.error("AniList Details Error:", errorMessage);
    throw new Error(`AniList Details Error: ${errorMessage}`);
  }
}

export async function searchAnilist(query: string, type: "ANIME" | "MANGA", page: number = 1) {
  return searchAnilistInternal(query, type, page);
}

export async function getAnilistDetails(id: string) {
  return getAnilistDetailsInternal(id);
}
