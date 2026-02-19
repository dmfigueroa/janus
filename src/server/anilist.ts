import { z } from "zod";
import { API_PAGE_SIZE } from "./constants";
import { type UnifiedMedia } from "./media";
import { getErrorMessage } from "./utils";

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
  startDate: z.object({
    year: z.number().nullable().optional(),
    month: z.number().nullable().optional(),
    day: z.number().nullable().optional(),
  }).optional(),
  averageScore: z.number().nullable().optional(),
  coverImage: z.object({
    large: z.string().nullable().optional(),
    extraLarge: z.string().nullable().optional(),
  }).optional(),
  bannerImage: z.string().nullable().optional(),
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
  const searchQuery = `
    query ($search: String, $type: MediaType, $page: Int, $perPage: Int) {
      Page (page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
        }
        media (search: $search, type: $type) {
          id
          title {
            romaji
            english
          }
          type
          description
          startDate {
            year
          }
          averageScore
          coverImage {
            large
            extraLarge
          }
          bannerImage
        }
      }
    }
  `;

  try {
    const rawData = await fetchAniList(searchQuery, {
      search: query,
      type,
      page,
      perPage: API_PAGE_SIZE,
    });

    const data = AniListResponseSchema.parse(rawData);
    const results: UnifiedMedia[] = data.data.Page.media.map((item) => ({
      id: item.id.toString(),
      mediaType: item.type === "ANIME" ? ("anime" as const) : ("manga" as const),
      source: "anilist" as const,
      title: item.title.english || item.title.romaji || "Unknown Title",
      poster: item.coverImage?.extraLarge || item.coverImage?.large || null,
      backdrop: item.bannerImage || null,
      year: item.startDate?.year?.toString(),
      rating: item.averageScore ? item.averageScore / 10 : undefined,
      overview: item.description || undefined,
    }));

    return {
      results,
      totalResults: data.data.Page.pageInfo.total || 0,
    };
  } catch (e) {
    const errorMessage = getErrorMessage(e);
    console.error("AniList Search Error:", errorMessage);
    throw new Error(`AniList Search Error: ${errorMessage}`);
  }
}

export async function getAnilistDetailsInternal(id: string) {
  const detailsQuery = `
    query ($id: Int) {
      Media (id: $id) {
        id
        title {
          romaji
          english
        }
        type
        description
        startDate {
          year
          month
          day
        }
        averageScore
        coverImage {
          large
          extraLarge
        }
        bannerImage
        episodes
        chapters
        volumes
      }
    }
  `;

  try {
    const rawData = await fetchAniList(detailsQuery, { id: parseInt(id) });
    const data = AniListDetailsResponseSchema.parse(rawData);
    const item = data.data.Media;

    return {
      id: item.id.toString(),
      mediaType: item.type === "ANIME" ? ("anime" as const) : ("manga" as const),
      source: "anilist" as const,
      title: item.title.english || item.title.romaji || "Unknown Title",
      poster: item.coverImage?.extraLarge || item.coverImage?.large || null,
      backdrop: item.bannerImage || null,
      year: item.startDate?.year?.toString(),
      releaseDate: item.startDate?.year
        ? `${item.startDate.year}-${(item.startDate.month || 1).toString().padStart(2, "0")}-${(item.startDate.day || 1).toString().padStart(2, "0")}`
        : undefined,
      rating: item.averageScore ? item.averageScore / 10 : undefined,
      overview: item.description || undefined,
      episodes: item.episodes,
      chapters: item.chapters,
      volumes: item.volumes,
    };
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
