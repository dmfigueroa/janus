import { comicVineIdSchema, providerResourceUrl } from "@/integrations/ProviderIds";
import { parseComicVineResponse } from "@/integrations/comicvine/ParseComicVineResponse.server";
import { requestProviderJson } from "@/integrations/ProviderRequest.server";
import { z } from "zod";

const comicVineVolumeSchema = z.object({
  name: z.string().nullable().optional(),
});

const comicVineVolumeDetailsResponseSchema = z.object({
  results: comicVineVolumeSchema,
});

async function getComicVolumeDetailsRequest(id: string, apiKey: string, signal?: AbortSignal) {
  const volumeId = comicVineIdSchema.parse(id);
  const url = providerResourceUrl({
    prefix: "https://comicvine.gamespot.com/api/volume/",
    segment: `4050-${volumeId}`,
    searchParams: new URLSearchParams({ api_key: apiKey, format: "json" }),
    trailingSlash: true,
  });
  const context = { provider: "comicvine", operation: "get_volume_details" };
  const rawData = await requestProviderJson(
    url,
    {
      headers: { "User-Agent": "JanusApp/1.0" },
      signal,
    },
    context,
  );
  const data = parseComicVineResponse(comicVineVolumeDetailsResponseSchema, rawData, context);

  return { title: data.results.name || "Unknown Title" };
}

export async function getComicVolumeDetails(id: string, apiKey: string, signal?: AbortSignal) {
  return getComicVolumeDetailsRequest(id, apiKey, signal);
}
