import { beforeEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { getComicIssues, searchComics } from "./-comicvine.server";

vi.stubGlobal("fetch", vi.fn());

type MockIssue = {
  id: number;
  name: string;
  issue_number: string;
  image: { medium_url: string };
  cover_date: string;
  description: string;
  deck: string;
};

function makeIssues(start: number, end: number): MockIssue[] {
  const issues: MockIssue[] = [];
  for (let i = start; i <= end; i += 1) {
    issues.push({
      id: i,
      name: `Issue ${i}`,
      issue_number: `${i}`,
      image: { medium_url: `https://img/${i}.jpg` },
      cover_date: "2020-01-01",
      description: `Description ${i}`,
      deck: `Deck ${i}`,
    });
  }
  return issues;
}

function okResponse(results: MockIssue[], total: number) {
  return {
    ok: true,
    json: async () => ({
      error: "OK",
      results,
      number_of_total_results: total,
    }),
  } as Response;
}

describe("getComicIssues", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches all pages and preserves issue order", async () => {
    let callCount = 0;
    const pageResponses = new Map<number, Response>();

    // Set up responses for each page
    pageResponses.set(0, okResponse(makeIssues(1, 100), 350));
    pageResponses.set(100, okResponse(makeIssues(101, 200), 350));
    pageResponses.set(200, okResponse(makeIssues(201, 300), 350));
    pageResponses.set(300, okResponse(makeIssues(301, 350), 350));

    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(input.toString());
      const offset = Number(url.searchParams.get("offset"));
      const sort = url.searchParams.get("sort");

      expect(sort).toBe("issue_number:asc");
      callCount += 1;

      const response = pageResponses.get(offset);
      if (response) {
        return Promise.resolve(response);
      }

      return Promise.resolve(okResponse([], 350));
    });

    const issues = await Effect.runPromise(getComicIssues("123", "api-key", { concurrency: 3 }));

    expect(issues).toHaveLength(350);
    expect(issues[0].id).toBe("1");
    expect(issues[99].id).toBe("100");
    expect(issues[349].id).toBe("350");
    expect(callCount).toBeGreaterThanOrEqual(4);
  });

  it("syncs incrementally for known issues and stops after fully known page", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(input.toString());
      const offset = Number(url.searchParams.get("offset"));
      const sort = url.searchParams.get("sort");

      expect(sort).toBe("issue_number:desc");

      if (offset === 0) {
        return Promise.resolve(okResponse([makeIssues(10, 10)[0], makeIssues(9, 9)[0]], 500));
      }

      if (offset === 2) {
        return Promise.resolve(okResponse([makeIssues(8, 8)[0], makeIssues(7, 7)[0]], 500));
      }

      return Promise.resolve(okResponse([], 500));
    });

    const issues = await Effect.runPromise(
      getComicIssues("123", "api-key", {
        knownIssueIds: new Set(["9", "8", "7"]),
      }),
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(issues.map((issue) => issue.id)).toEqual(["10"]);
  });
});

describe("searchComics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps ComicVine search results to unified media", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 123,
            name: "Saga",
            image: { medium_url: "https://img/saga.jpg" },
            start_year: "2012",
            deck: "Space fantasy",
          },
        ],
        number_of_total_results: 1,
      }),
    } as Response);

    const result = await Effect.runPromise(searchComics("Saga", "api-key", 1));

    expect(result.totalResults).toBe(1);
    expect(result.results).toEqual([
      {
        id: "123",
        mediaType: "comic",
        source: "comicvine",
        title: "Saga",
        poster: "https://img/saga.jpg",
        year: "2012",
        rating: undefined,
        overview: "Space fantasy",
      },
    ]);
  });
});
