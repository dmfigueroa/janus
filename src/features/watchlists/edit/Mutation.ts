import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { releaseDateSchema } from "@/features/watchlists/ReleaseDate";
import { editWatchlistItemMutation } from "./Mutation.server";

export const posterPathSchema = z
  .union([
    z
      .string()
      .url("Poster image must be a valid URL.")
      .startsWith(
        "https://",
        "Poster image must be an HTTPS URL or a provider path beginning with /.",
      ),
    z.string().regex(/^\/\S+$/, "Poster image path must start with / and contain no spaces."),
  ])
  .nullable();

export const editWatchlistItemSchema = z.object({
  watchlistId: z.number(),
  itemId: z.number(),
  title: z.string().trim().min(1, "Title is required."),
  releaseDate: z.union([releaseDateSchema, z.null()]),
  posterPath: posterPathSchema,
});

export type EditWatchlistItemInput = z.infer<typeof editWatchlistItemSchema>;

export const editWatchlistItem = createServerFn({ method: "POST" })
  .inputValidator((data) => editWatchlistItemSchema.parse(data))
  .handler(async ({ data }) => editWatchlistItemMutation(data));
