import { requestProviderJson, parseProviderData } from "@/integrations/ProviderRequest.server";
import { z } from "zod";

const comicVineVolumeSchema = z.object({
  name: z.string().nullable().optional(),
});

const comicVineVolumeDetailsResponseSchema = z.object({
  results: comicVineVolumeSchema,
});

async function getComicVolumeDetailsRequest(id: string, apiKey: string, signal?: AbortSignal) {
  const url = new URL(`https://comicvine.gamespot.com/api/volume/4050-${encodeURIComponent(id)}/`);
  url.search = new URLSearchParams({ api_key: apiKey, format: "json" }).toString();

  const context = { provider: "comicvine", operation: "get_volume_details" };
  const rawData = await requestProviderJson(
    url.toString(),
    {
      headers: { "User-Agent": "JanusApp/1.0" },
      signal,
    },
    context,
  );
  const data = parseProviderData(comicVineVolumeDetailsResponseSchema, rawData, context);

  return { title: data.results.name || "Unknown Title" };
}

export async function getComicVolumeDetails(id: string, apiKey: string, signal?: AbortSignal) {
  return getComicVolumeDetailsRequest(id, apiKey, signal);
}
