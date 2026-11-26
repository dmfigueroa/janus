import { z } from "zod";

export const lineupSystemKeys = ["movie", "television", "game", "book", "comic"] as const;
export type SystemLineupKey = (typeof lineupSystemKeys)[number];

export const lineupReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("system"), key: z.enum(lineupSystemKeys) }),
  z.object({ kind: z.literal("custom"), id: z.number().int().positive() }),
]);

export type LineupReference = z.infer<typeof lineupReferenceSchema>;
