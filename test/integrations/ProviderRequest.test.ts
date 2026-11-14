import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedLogRecord } from "@test/support/LogCapture";
import { captureServerLogs, restoreServerLogs } from "@test/support/LogCapture";
import { z } from "zod";
import {
  ProviderRequestError,
  PROVIDER_RETRY_POLICY,
  parseProviderData,
  requestProviderJson,
} from "@/integrations/ProviderRequest.server";

vi.stubGlobal("fetch", vi.fn());

const fastRetry = { ...PROVIDER_RETRY_POLICY, delay: () => 0 };

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("provider transport", () => {
  let logs: CapturedLogRecord[];

  beforeEach(() => {
    vi.resetAllMocks();
    logs = captureServerLogs();
  });

  afterEach(() => {
    restoreServerLogs();
  });

  it("recovers from a transient transport failure", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await requestProviderJson("https://example.test/items", {
      retry: fastRetry,
    });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports provider_unavailable after exhausting retries", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      requestProviderJson("https://example.test/items", {
        retry: { ...fastRetry, limit: 2 },
      }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent HTTP failures", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "bad request" }, { status: 400 }));

    await expect(requestProviderJson("https://example.test/items")).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("logs provider failures with operation, outcome, and duration", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, { status: 503 }));

    await expect(
      requestProviderJson(
        "https://example.test/items?api_key=query-secret",
        { retry: { ...fastRetry, limit: 0 } },
        { provider: "rawg", operation: "search_games" },
      ),
    ).rejects.toBeInstanceOf(ProviderRequestError);

    expect(logs).toContainEqual(
      expect.objectContaining({
        event: "provider.request.failed",
        provider: "rawg",
        operation: "search_games",
        outcome: "http_error",
        status: 503,
        durationMs: expect.any(Number),
        requestId: expect.any(String),
      }),
    );
    expect(JSON.stringify(logs)).not.toContain("query-secret");
  });

  it("logs invalid provider responses without request bodies", async () => {
    const schema = z.object({ id: z.number() });

    expect(() =>
      parseProviderData(
        schema,
        { unexpected: "sensitive payload" },
        { provider: "tmdb", operation: "get_movie_details" },
      ),
    ).toThrow(ProviderRequestError);

    expect(logs).toContainEqual(
      expect.objectContaining({
        event: "provider.response.invalid",
        provider: "tmdb",
        operation: "get_movie_details",
        outcome: "invalid_response",
        issueCount: 1,
      }),
    );
    expect(JSON.stringify(logs)).not.toContain("sensitive payload");
  });

  it.each([500, 503])("retries status %i and honors Retry-After", async (status) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          { error: "unavailable" },
          { status, headers: { "Content-Type": "application/json", "Retry-After": "0" } },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await requestProviderJson("https://example.test/items", {
      retry: fastRetry,
    });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry response validation failures", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ unexpected: true }));

    const response = await requestProviderJson("https://example.test/items");
    const schema = z.object({ id: z.number() });

    expect(() => parseProviderData(schema, response)).toThrow(ProviderRequestError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("surfaces cancellation without retrying", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation((input) => {
      const signal = (input as Request).signal;
      return new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });

    const request = requestProviderJson("https://example.test/items", {
      signal: controller.signal,
      retry: fastRetry,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry POST requests without an explicit override", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      requestProviderJson("https://example.test/items", {
        method: "POST",
        retry: fastRetry,
      }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails a request that exceeds its deadline", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}));

    await expect(
      requestProviderJson("https://example.test/items", {
        timeout: 10,
        totalTimeout: 100,
        retry: { ...fastRetry, limit: 0 },
      }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});
