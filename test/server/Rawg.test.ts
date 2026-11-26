import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ProviderRequestError } from "@/integrations/ProviderRequest.server";
import { getGameDetails } from "@/server/providers/Rawg.server";

vi.stubGlobal("fetch", vi.fn());

const adversarialGameIds = ["..", "1?key=x", "123,name:bar"];

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function getFetchedUrl(call: unknown[]) {
  const input = call[0] as Request | string | URL;
  return input instanceof Request ? input.url : input.toString();
}

function isRejectedProviderId(error: unknown) {
  return error instanceof ZodError || error instanceof ProviderRequestError;
}

describe("rawg getGameDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requests numeric game id 3498", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ id: 3498, name: "Canonical Game", released: "2013-09-17" }),
    );

    await expect(getGameDetails("3498", "test-api-key")).resolves.toMatchObject({
      id: "3498",
      title: "Canonical Game",
    });
    expect(getFetchedUrl(vi.mocked(fetch).mock.calls[0] ?? [])).toBe(
      "https://api.rawg.io/api/games/3498?key=test-api-key",
    );
  });

  it.each(adversarialGameIds)("rejects game id %s before calling RAWG", async (gameId) => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ id: 1, name: "Injected Game", released: null }),
    );

    await expect(getGameDetails(gameId, "test-api-key")).rejects.toSatisfy(isRejectedProviderId);
    expect(fetch).not.toHaveBeenCalled();
  });
});
