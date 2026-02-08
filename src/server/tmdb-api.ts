const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export interface TMDBMedia {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  overview: string;
}

export interface TMDBSearchResponse {
  page: number;
  results: TMDBMedia[];
  total_pages: number;
  total_results: number;
}

export async function fetchFromTMDB(
  query: string,
  page: number,
  type: "movie" | "tv",
  apiKey: string,
): Promise<TMDBSearchResponse> {
  const endpoint = type === "movie" ? "search/movie" : "search/tv";
  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);

  // Use Bearer Token auth via Authorization header
  url.searchParams.set("query", query);
  url.searchParams.set("page", page.toString());
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    console.error(`TMDB API Error: ${response.status} ${response.statusText}`);
    throw new Error("Failed to fetch data from TMDB");
  }

  const data = (await response.json()) as TMDBSearchResponse;

  data.results = data.results.map((item) => ({
    ...item,
    media_type: item.media_type || type,
  }));

  return data;
}

export async function getTVDetails(id: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/tv/${id}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch TV details");
  }
  return response.json();
}

export async function getSeasonDetails(id: number, seasonNumber: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/tv/${id}/season/${seasonNumber}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch season details");
  }
  return response.json();
}

export async function getMovieDetails(id: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/movie/${id}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch movie details");
  }
  return response.json();
}
