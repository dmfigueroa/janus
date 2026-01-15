"use server";

import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { watchlists } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const watchlistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const getWatchlists = createServerFn().handler(async () => {
  return await db.select().from(watchlists).orderBy(desc(watchlists.createdAt));
});

export const createWatchlist = createServerFn()
  .inputValidator((data: z.infer<typeof watchlistSchema>) => watchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const [newItem] = await db
      .insert(watchlists)
      .values({
        name: data.name,
        description: data.description,
      })
      .returning();
    return newItem;
  });

export const deleteWatchlist = createServerFn()
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    await db.delete(watchlists).where(eq(watchlists.id, data.id));
    return { success: true };
  });
