import { z } from "zod";
import { Effect } from "effect";
import { API_PAGE_SIZE } from "../-constants";
import { type UnifiedMedia } from "../-media";
import { fetchJson, parseWithSchema, runServerEffect } from "../-effect";

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
  coverImage: z
    .object({
      large: z.string().nullable().optional(),
      extraLarge: z.string().nullable().optional(),
    })
    .optional(),
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
  const program = fetchJson({
    url: ANILIST_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    },
    context: "AniList API Error",
  });

  return runServerEffect(program);
}

type AniListMedia = z.infer<typeof AniListMediaSchema>;

const toUnifiedAniListMedia = (item: AniListMedia): UnifiedMedia => ({
  id: item.id.toString(),
  mediaType: item.type === "ANIME" ? "anime" : "manga",
  source: "anilist",
  title: item.title.english || item.title.romaji || "Unknown Title",
  poster: item.coverImage?.extraLarge || item.coverImage?.large || null,
  backdrop: item.bannerImage || null,
  year: item.startDate?.year?.toString(),
  rating: item.averageScore ? item.averageScore / 10 : undefined,
  overview: item.description || undefined,
});

const toUnifiedAniListDetail = (item: AniListMedia) => ({
  ...toUnifiedAniListMedia(item),
  releaseDate: item.startDate?.year
    ? `${item.startDate.year}-${(item.startDate.month || 1).toString().padStart(2, "0")}-${(item.startDate.day || 1).toString().padStart(2, "0")}`
    : undefined,
  episodes: item.episodes,
  chapters: item.chapters,
  volumes: item.volumes,
});

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

  const program = Effect.gen(function* () {
    const rawData = yield* Effect.tryPromise({
      try: () =>
        fetchAniList(searchQuery, {
          search: query,
          type,
          page,
          perPage: API_PAGE_SIZE,
        }),
      catch: (error: unknown) => new Error(`AniList Search Error: ${String(error)}`),
    });

    const data = yield* parseWithSchema(AniListResponseSchema, rawData, "AniList Search Error");

    return {
      results: data.data.Page.media.map(toUnifiedAniListMedia),
      totalResults: data.data.Page.pageInfo.total || 0,
    };
  });

  return runServerEffect(program);
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

  const program = Effect.gen(function* () {
    const rawData = yield* Effect.tryPromise({
      try: () => fetchAniList(detailsQuery, { id: Number.parseInt(id, 10) }),
      catch: (error: unknown) => new Error(`AniList Details Error: ${String(error)}`),
    });

    const data = yield* parseWithSchema(
      AniListDetailsResponseSchema,
      rawData,
      "AniList Details Error",
    );

    return toUnifiedAniListDetail(data.data.Media);
  });

  return runServerEffect(program);
}

export async function searchAnilist(query: string, type: "ANIME" | "MANGA", page: number = 1) {
  return searchAnilistInternal(query, type, page);
}

export async function getAnilistDetails(id: string) {
  return getAnilistDetailsInternal(id);
}
