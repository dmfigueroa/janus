import { Effect } from "effect";
import { z } from "zod";
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
const ANI_LIST_SEARCH_ERROR = "AniList Search Error";
const ANI_LIST_DETAILS_ERROR = "AniList Details Error";

const SEARCH_QUERY = `
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

const DETAILS_QUERY = `
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

function fetchAniList(
  query: string,
  variables: Record<string, unknown>,
): Effect.Effect<unknown, Error> {
  return fetchJson({
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
}

type AniListMedia = z.infer<typeof AniListMediaSchema>;

type AniListDetail = UnifiedMedia & {
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
};

function formatAniListReleaseDate(item: AniListMedia): string | undefined {
  if (!item.startDate?.year) {
    return undefined;
  }

  const month = (item.startDate.month ?? 1).toString().padStart(2, "0");
  const day = (item.startDate.day ?? 1).toString().padStart(2, "0");
  return `${item.startDate.year}-${month}-${day}`;
}

const toUnifiedAniListMedia = (item: AniListMedia): UnifiedMedia => ({
  id: item.id.toString(),
  mediaType: item.type === "ANIME" ? "anime" : "manga",
  source: "anilist",
  title: item.title.english || item.title.romaji || "Unknown Title",
  poster: item.coverImage?.extraLarge || item.coverImage?.large || null,
  backdrop: item.bannerImage || null,
  year: item.startDate?.year?.toString(),
  rating: item.averageScore != null ? item.averageScore / 10 : undefined,
  overview: item.description ?? undefined,
});

const toUnifiedAniListDetail = (item: AniListMedia): AniListDetail => ({
  ...toUnifiedAniListMedia(item),
  releaseDate: formatAniListReleaseDate(item),
  episodes: item.episodes,
  chapters: item.chapters,
  volumes: item.volumes,
});

export async function searchAnilist(
  query: string,
  type: "ANIME" | "MANGA",
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const program = fetchAniList(SEARCH_QUERY, {
    search: query,
    type,
    page,
    perPage: API_PAGE_SIZE,
  }).pipe(
    Effect.flatMap((rawData) =>
      parseWithSchema(AniListResponseSchema, rawData, ANI_LIST_SEARCH_ERROR),
    ),
    Effect.map((data) => ({
      results: data.data.Page.media.map(toUnifiedAniListMedia),
      totalResults: data.data.Page.pageInfo.total ?? 0,
    })),
  );

  return runServerEffect(program);
}

export async function getAnilistDetails(id: string): Promise<AniListDetail> {
  const parsedId = Number.parseInt(id, 10);
  const program = (
    Number.isNaN(parsedId)
      ? Effect.fail(new Error(`${ANI_LIST_DETAILS_ERROR}: invalid id '${id}'`))
      : fetchAniList(DETAILS_QUERY, { id: parsedId })
  ).pipe(
    Effect.flatMap((rawData) =>
      parseWithSchema(AniListDetailsResponseSchema, rawData, ANI_LIST_DETAILS_ERROR),
    ),
    Effect.map((data) => toUnifiedAniListDetail(data.data.Media)),
  );

  return runServerEffect(program);
}
