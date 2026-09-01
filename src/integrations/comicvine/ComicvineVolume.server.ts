import { z } from "zod";
import { getErrorMessage } from "@/server/Utils";

const comicVineVolumeSchema = z.object({
  name: z.string().nullable().optional(),
});

const comicVineVolumeDetailsResponseSchema = z.object({
  results: comicVineVolumeSchema,
});

async function getComicVolumeDetailsRequest(id: string, apiKey: string) {
  const url = new URL(`https://comicvine.gamespot.com/api/volume/4050-${encodeURIComponent(id)}/`);
  url.search = new URLSearchParams({ api_key: apiKey, format: "json" }).toString();

  const response = await fetch(url.toString(), { headers: { "User-Agent": "JanusApp/1.0" } });
  if (!response.ok) throw new Error(`ComicVine volume request failed: ${response.status}`);

  const data = comicVineVolumeDetailsResponseSchema.parse(await response.json());
  return { title: data.results.name || "Unknown Title" };
}

export async function getComicVolumeDetails(id: string, apiKey: string) {
  try {
    return await getComicVolumeDetailsRequest(id, apiKey);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error("ComicVine volume details error:", errorMessage);
    throw new Error(`ComicVine volume details error: ${errorMessage}`);
  }
}
