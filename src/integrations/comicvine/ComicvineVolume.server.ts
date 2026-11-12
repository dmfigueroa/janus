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

  const rawData = await requestProviderJson(url.toString(), {
    headers: { "User-Agent": "JanusApp/1.0" },
    signal,
  });
  const data = parseProviderData(comicVineVolumeDetailsResponseSchema, rawData);

  return { title: data.results.name || "Unknown Title" };
}

export async function getComicVolumeDetails(id: string, apiKey: string, signal?: AbortSignal) {
  return getComicVolumeDetailsRequest(id, apiKey, signal);
}
