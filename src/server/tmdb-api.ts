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

export interface TMDBErrorResponse {
  status_code: number;
  status_message: string;
  success: boolean;
}

async function fetchWithAuth(url: string, apiKey: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    try {
      const errorData = (await response.json()) as TMDBErrorResponse;
      if (errorData.status_code && errorData.status_message) {
        console.error(
          `TMDB API Error: ${response.status} (Code: ${errorData.status_code}) - ${errorData.status_message}`
        );
      } else {
        console.error(`TMDB API Error: ${response.status} ${response.statusText}`);
      }
    } catch {
      // Fallback if response is not JSON
      console.error(`TMDB API Error: ${response.status} ${response.statusText}`);
    }
    throw new Error(`Failed to fetch data from TMDB: ${response.status}`);
  }

  return response.json();
}

export async function fetchFromTMDB(
  query: string,
  page: number,
  type: "movie" | "tv",
  apiKey: string,
): Promise<TMDBSearchResponse> {
  const endpoint = type === "movie" ? "search/movie" : "search/tv";
  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);

  url.searchParams.set("query", query);
  url.searchParams.set("page", page.toString());
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");

  const data = (await fetchWithAuth(url.toString(), apiKey)) as TMDBSearchResponse;

  data.results = data.results.map((item) => ({
    ...item,
    media_type: item.media_type || type,
  }));

  return data;
}

export async function getTVDetails(id: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/tv/${id}`);
  return fetchWithAuth(url.toString(), apiKey);
}

export async function getSeasonDetails(id: number, seasonNumber: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/tv/${id}/season/${seasonNumber}`);
  return fetchWithAuth(url.toString(), apiKey);
}

export async function getMovieDetails(id: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/movie/${id}`);
  return fetchWithAuth(url.toString(), apiKey);
}
