export interface UnifiedMedia {
  id: string;
  mediaType: "movie" | "tv" | "game" | "book" | "comic";
  title: string;
  poster: string | null;
  backdrop?: string | null;
  year?: string;
  rating?: number;
  overview?: string;
  source: "tmdb" | "google_books" | "rawg" | "comicvine";
}

export async function searchBooks(
  query: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
    const maxResults = 20;
    const startIndex = (page - 1) * maxResults;
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.search = new URLSearchParams({
      q: query,
      startIndex: startIndex.toString(),
      maxResults: maxResults.toString(),
    }).toString();

    const res = await fetch(url.toString());
    if (!res.ok) return { results: [], totalResults: 0 };
    const data = await res.json();

    const results = (data.items || []).map((item: any) => ({
      id: item.id,
      mediaType: "book",
      source: "google_books",
      title: item.volumeInfo.title,
      poster: item.volumeInfo.imageLinks?.thumbnail?.replace("http:", "https:") || null,
      year: item.volumeInfo.publishedDate?.split("-")[0],
      rating: item.volumeInfo.averageRating ? item.volumeInfo.averageRating * 2 : undefined, // Normalizar a escala de 10
      overview: item.volumeInfo.description,
    }));

    return {
      results,
      totalResults: data.totalItems || 0,
    };
  } catch (e) {
    console.error("Google Books API Error", e);
    return { results: [], totalResults: 0 };
  }
}

export async function searchGames(
  query: string,
  apiKey: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
    const pageSize = 20;
    const url = new URL("https://api.rawg.io/api/games");
    url.search = new URLSearchParams({
      key: apiKey,
      search: query,
      page: page.toString(),
      page_size: pageSize.toString(),
    }).toString();

    const res = await fetch(url.toString());
    if (!res.ok) return { results: [], totalResults: 0 };
    const data = await res.json();

    const results = (data.results || []).map((game: any) => ({
      id: game.id.toString(),
      mediaType: "game",
      source: "rawg",
      title: game.name,
      poster: game.background_image,
      year: game.released?.split("-")[0],
      rating: game.rating ? game.rating * 2 : undefined,
      overview: undefined,
    }));

    return {
      results,
      totalResults: data.count || 0,
    };
  } catch (e) {
    console.error("RAWG API Error", e);
    return { results: [], totalResults: 0 };
  }
}

export async function searchComics(
  query: string,
  apiKey: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
    const limit = 20;
    const url = new URL("https://comicvine.gamespot.com/api/search/");
    url.search = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      resources: "volume",
      query: query,
      page: page.toString(),
      limit: limit.toString(),
    }).toString();

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "JanusApp/1.0",
      },
    });

    if (!res.ok) return { results: [], totalResults: 0 };
    const data = await res.json();

    const results = (data.results || []).map((item: any) => ({
      id: item.id.toString(),
      mediaType: "comic",
      source: "comicvine",
      title: item.name || "Unknown Title",
      poster: item.image?.medium_url || item.image?.small_url || null,
      year: item.start_year,
      rating: undefined,
      overview: item.deck || item.description,
    }));

    return {
      results,
      totalResults: data.number_of_total_results || 0,
    };
  } catch (e) {
    console.error("ComicVine API Error", e);
    return { results: [], totalResults: 0 };
  }
}
export async function getComicIssues(volumeId: string, apiKey: string): Promise<any[]> {
  const allIssues: any[] = [];
  let offset = 0;
  let totalResults = 1;
  const limit = 100;

  try {
    while (offset < totalResults) {
      const url = new URL("https://comicvine.gamespot.com/api/issues/");
      url.search = new URLSearchParams({
        api_key: apiKey,
        filter: `volume:${volumeId}`,
        sort: "issue_number:asc",
        format: "json",
        limit: limit.toString(),
        offset: offset.toString(),
      }).toString();

      const res = await fetch(url, {
        headers: {
          "User-Agent": "JanusApp/1.0",
        },
      });

      if (!res.ok) {
        console.error(`ComicVine API Error (Status ${res.status}): ${res.statusText}`);
        break;
      }

      const data = await res.json();

      if (data.error !== "OK") {
        console.error(`ComicVine API Error (Response): ${data.error}`);
        break;
      }

      const results = data.results || [];
      allIssues.push(...results);

      totalResults = data.number_of_total_results;
      offset += results.length;

      console.log(`Fetched ${results.length} issues (Total: ${allIssues.length}/${totalResults})`);

      if (results.length === 0) break;
    }

    return allIssues.map((issue: any) => ({
      id: issue.id.toString(),
      mediaType: "comic",
      source: "comicvine",
      title: issue.name || `Issue #${issue.issue_number}`,
      poster: issue.image?.medium_url || issue.image?.small_url || null,
      coverDate: issue.cover_date,
      issueNumber: issue.issue_number,
      description: issue.description || issue.deck,
    }));
  } catch (e) {
    console.error("ComicVine Issues API Search Error", e);
    return allIssues.length > 0
      ? allIssues.map((issue: any) => ({
          id: issue.id.toString(),
          mediaType: "comic",
          source: "comicvine",
          title: issue.name || `Issue #${issue.issue_number}`,
          poster: issue.image?.medium_url || issue.image?.small_url || null,
          coverDate: issue.cover_date,
          issueNumber: issue.issue_number,
          description: issue.description || issue.deck,
        }))
      : [];
  }
}
