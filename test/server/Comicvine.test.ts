import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { CapturedLogRecord } from "@test/support/LogCapture";
import { captureServerLogs, restoreServerLogs } from "@test/support/LogCapture";
import { ProviderRequestError } from "@/integrations/ProviderRequest.server";
import { getComicIssue } from "@/integrations/comicvine/ComicvineIssueDetail.server";
import { getComicVolumeDetails } from "@/integrations/comicvine/ComicvineVolume.server";
import { getComicIssues, searchComics } from "@/server/providers/Comicvine.server";

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
  return new Response(
    JSON.stringify({
      error: "OK",
      results,
      number_of_total_results: total,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function getFetchedUrl(input: Request | string | URL) {
  return input instanceof Request ? input.url : input.toString();
}

function isRejectedProviderId(error: unknown) {
  return error instanceof ZodError || error instanceof ProviderRequestError;
}

function limitExceededResponse() {
  return new Response(JSON.stringify({ error: "Limit Exceeded", results: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function expectProviderErrorLog(logs: CapturedLogRecord[], operation: string) {
  expect(logs.map((record) => record.outcome)).toContain("provider_error");
  expect(logs.map((record) => record.outcome)).not.toContain("invalid_response");
  expect(logs).toContainEqual(
    expect.objectContaining({
      event: "provider.response.failed",
      provider: "comicvine",
      operation,
      outcome: "provider_error",
      providerMessage: "Limit Exceeded",
    }),
  );
}

const adversarialComicIds = ["..", "123,name:bar"];

async function waitForCalls(mockedFn: ReturnType<typeof vi.fn>, expectedCalls: number) {
  await vi.waitFor(() => {
    expect(mockedFn).toHaveBeenCalledTimes(expectedCalls);
  });
}

describe("getComicIssues", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches remaining pages in parallel and preserves issue order", async () => {
    const pendingResolves = new Map<number, (value: Response) => void>();

    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(getFetchedUrl(input));
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

  it("retries transient page transport failures only through the shared transport", async () => {
    let attempts = 0;
    vi.mocked(fetch).mockImplementation(() => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new TypeError("fetch failed"));
      return Promise.resolve(okResponse([makeIssues(1, 1)[0]], 1));
    });

    const issues = await getComicIssues("123", "api-key");

    expect(issues.map((issue) => issue.id)).toEqual(["1"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("syncs every page for known issues so it includes older missing issues", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(getFetchedUrl(input));
      const offset = Number(url.searchParams.get("offset"));
      const sort = url.searchParams.get("sort");

      expect(sort).toBe("issue_number:desc");

      if (offset === 0) {
        return Promise.resolve(okResponse([makeIssues(10, 10)[0], makeIssues(9, 9)[0]], 5));
      }

      if (offset === 2) {
        return Promise.resolve(okResponse([makeIssues(8, 8)[0], makeIssues(7, 7)[0]], 5));
      }

      return Promise.resolve(okResponse([makeIssues(6, 6)[0]], 5));
    });

    const issues = await getComicIssues("123", "api-key", {
      knownIssueIds: new Set(["9", "8", "7"]),
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(issues.map((issue) => issue.id)).toEqual(["10", "6"]);
  });
});

describe("getComicIssue", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps a provider issue ID with its canonical volume", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "OK",
          results: {
            id: 9001,
            name: "Selected Issue",
            issue_number: "7",
            cover_date: "2024-03-14",
            volume: { id: 4050, name: "Canonical Volume" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getComicIssue("9001", "api-key")).resolves.toMatchObject({
      id: "9001",
      title: "Selected Issue",
      issueNumber: "7",
      parent: { id: "4050", title: "Canonical Volume" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(getFetchedUrl(vi.mocked(fetch).mock.calls[0]?.[0])).pathname).toBe(
      "/api/issue/4000-9001/",
    );
  });
});

describe("comicvine provider ids", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(adversarialComicIds)("rejects volume id %s before fetching issues", async (volumeId) => {
    vi.mocked(fetch).mockResolvedValue(okResponse(makeIssues(1, 1), 1));

    await expect(getComicIssues(volumeId, "api-key")).rejects.toSatisfy(isRejectedProviderId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(adversarialComicIds)("rejects issue id %s before fetching an issue", async (issueId) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "OK",
          results: {
            id: 9001,
            name: "Selected Issue",
            issue_number: "7",
            volume: { id: 4050, name: "Canonical Volume" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getComicIssue(issueId, "api-key")).rejects.toSatisfy(isRejectedProviderId);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("comicvine error envelopes", () => {
  let logs: CapturedLogRecord[];

  beforeEach(() => {
    vi.resetAllMocks();
    logs = captureServerLogs();
  });

  afterEach(() => {
    restoreServerLogs();
  });

  it("rejects a limit-exceeded search envelope", async () => {
    vi.mocked(fetch).mockResolvedValue(limitExceededResponse());

    await expect(searchComics("watchmen", "api-key")).rejects.toBeInstanceOf(ProviderRequestError);
    expectProviderErrorLog(logs, "search_comics");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a limit-exceeded volume envelope", async () => {
    vi.mocked(fetch).mockResolvedValue(limitExceededResponse());

    await expect(getComicVolumeDetails("4050", "api-key")).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    expectProviderErrorLog(logs, "get_volume_details");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a limit-exceeded issue envelope as a provider error", async () => {
    vi.mocked(fetch).mockResolvedValue(limitExceededResponse());

    await expect(getComicIssue("9001", "api-key")).rejects.toBeInstanceOf(ProviderRequestError);
    expectProviderErrorLog(logs, "get_issue_details");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
