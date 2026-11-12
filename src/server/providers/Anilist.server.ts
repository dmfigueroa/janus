import { z } from "zod";
import {
  PROVIDER_RETRY_POLICY,
  parseProviderData,
  requestProviderJson,
  rethrowProviderFailure,
} from "@/integrations/ProviderRequest.server";
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

// AniList uses a read-only GraphQL POST. Retry it explicitly instead of
// enabling retries for POST requests globally.
const ANILIST_POST_RETRY_POLICY = {
  ...PROVIDER_RETRY_POLICY,
  methods: ["post"],
};

async function fetchAniList(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return requestProviderJson(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    json: {
      query,
      variables,
    },
    retry: ANILIST_POST_RETRY_POLICY,
    signal,
  });
}

export async function searchAnilistInternal(
  query: string,
  type: "ANIME" | "MANGA",
  page: number = 1,
  signal?: AbortSignal,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
    const rawData = await fetchAniList(
      ANILIST_SEARCH_QUERY,
      {
        search: query,
        type,
        page,
        perPage: API_PAGE_SIZE,
      },
      signal,
    );

    const data = parseProviderData(AniListResponseSchema, rawData);
    const results: UnifiedMedia[] = data.data.Page.media.map(mapAniListMedia);

    return {
      results,
      totalResults: getAniListTotal(data.data.Page.pageInfo.total),
    };
  } catch (error) {
    console.error("AniList Search Error:", getErrorMessage(error));
    rethrowProviderFailure(error, "AniList Search Error");
  }
}

export async function getAnilistDetailsInternal(id: string, signal?: AbortSignal) {
  try {
    const rawData = await fetchAniList(ANILIST_DETAILS_QUERY, { id: parseInt(id) }, signal);
    const data = parseProviderData(AniListDetailsResponseSchema, rawData);
    return mapAniListDetails(data.data.Media);
  } catch (error) {
    console.error("AniList Details Error:", getErrorMessage(error));
    rethrowProviderFailure(error, "AniList Details Error");
  }
}

export async function searchAnilist(
  query: string,
  type: "ANIME" | "MANGA",
  page: number = 1,
  signal?: AbortSignal,
) {
  return searchAnilistInternal(query, type, page, signal);
}

export async function getAnilistDetails(id: string, signal?: AbortSignal) {
  return getAnilistDetailsInternal(id, signal);
}
