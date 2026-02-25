import { beforeEach, describe, expect, it, vi } from "vitest";
import { getComicIssues, searchComics } from "./-comicvine";

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

async function waitForCalls(mockedFn: ReturnType<typeof vi.fn>, expectedCalls: number) {
  for (let i = 0; i < 20; i += 1) {
    if (mockedFn.mock.calls.length >= expectedCalls) {
      return;
    }
    await Promise.resolve();
  }
}

describe("getComicIssues", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches remaining pages in parallel and preserves issue order", async () => {
    const pendingResolves = new Map<number, (value: Response) => void>();

    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(input.toString());
      const offset = Number(url.searchParams.get("offset"));
      const sort = url.searchParams.get("sort");

      expect(sort).toBe("issue_number:asc");

      if (offset === 0) {
        return Promise.resolve(okResponse(makeIssues(1, 100), 350));
      }

      return new Promise<Response>((resolve) => {
        pendingResolves.set(offset, resolve);
      });
    });

    const issuesPromise = getComicIssues("123", "api-key", { concurrency: 3 });

    await waitForCalls(vi.mocked(fetch), 4);

    expect(fetch).toHaveBeenCalledTimes(4);

    expect(pendingResolves.size).toBe(3);
    expect([...pendingResolves.keys()].sort((a, b) => a - b)).toEqual([100, 200, 300]);

    pendingResolves.get(100)?.(okResponse(makeIssues(101, 200), 350));
    pendingResolves.get(200)?.(okResponse(makeIssues(201, 300), 350));
    pendingResolves.get(300)?.(okResponse(makeIssues(301, 350), 350));

    const issues = await issuesPromise;

    expect(issues).toHaveLength(350);
    expect(issues[0].id).toBe("1");
    expect(issues[349].id).toBe("350");
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

    const issues = await getComicIssues("123", "api-key", {
      knownIssueIds: new Set(["9", "8", "7"]),
    });

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

    const result = await searchComics("Saga", "api-key", 1);

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
