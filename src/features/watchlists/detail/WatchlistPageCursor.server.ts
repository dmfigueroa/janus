import { z } from "zod";

const watchlistPageCursorSchema = z.object({
  offset: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  query: z.string().optional(),
  resultView: z.enum(["items", "titles"]).optional(),
  watchlistId: z.number().int().positive(),
});

export type WatchlistPageCursorInput = {
  cursor?: string;
  watchlistId: number;
  pageSize: number;
  query?: string;
  resultView?: "items" | "titles";
};

export type WatchlistNextCursorInput = {
  hasNextPage: boolean;
  offset: number;
  pageSize: number;
  query: string | undefined;
  watchlistId: number;
  resultView?: "items" | "titles";
};

export function getPageOffset({
  cursor,
  watchlistId,
  pageSize,
  query,
  resultView,
}: WatchlistPageCursorInput) {
  return cursor === undefined
    ? 0
    : decodeWatchlistPageCursor(cursor, watchlistId, pageSize, query, resultView);
}

export function nextCursorForPage({
  hasNextPage,
  offset,
  pageSize,
  query,
  watchlistId,
  resultView,
}: WatchlistNextCursorInput) {
  if (!hasNextPage) return undefined;
  return encodeWatchlistPageCursor({
    offset: offset + pageSize,
    pageSize,
    query,
    resultView,
    watchlistId,
  });
}

function encodeWatchlistPageCursor(cursor: z.infer<typeof watchlistPageCursorSchema>) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeWatchlistPageCursor(
  cursor: string,
  watchlistId: number,
  pageSize: number,
  query?: string,
  resultView?: "items" | "titles",
) {
  const decoded = watchlistPageCursorSchema.parse(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
  );

  const cursorMatches = [
    decoded.watchlistId === watchlistId,
    decoded.pageSize === pageSize,
    decoded.query === query,
    decoded.resultView === resultView,
  ].every(Boolean);
  if (!cursorMatches) {
    throw new Error("Invalid watchlist item cursor.");
  }

  return decoded.offset;
}
