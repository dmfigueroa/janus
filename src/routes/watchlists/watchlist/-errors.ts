import { Data } from "effect";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WatchlistNotFoundError extends Data.TaggedError("WatchlistNotFoundError")<{
  readonly id: number;
}> {}

export class WatchlistItemNotFoundError extends Data.TaggedError("WatchlistItemNotFoundError")<{
  readonly id: number;
}> {}

export class DuplicateWatchlistItemError extends Data.TaggedError("DuplicateWatchlistItemError")<{
  readonly watchlistId: number;
  readonly tmdbId: string;
  readonly mediaType: string;
}> {}

export class InvalidMediaError extends Data.TaggedError("InvalidMediaError")<{
  readonly message: string;
  readonly mediaType?: string;
  readonly source?: string;
}> {}

export class ExternalApiError extends Data.TaggedError("ExternalApiError")<{
  readonly message: string;
  readonly provider: string;
  readonly cause?: unknown;
}> {}

export class MergeWatchlistError extends Data.TaggedError("MergeWatchlistError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ConfigurationError extends Data.TaggedError("ConfigurationError")<{
  readonly variable: string;
}> {}

export type WatchlistError =
  | DatabaseError
  | WatchlistNotFoundError
  | WatchlistItemNotFoundError
  | DuplicateWatchlistItemError
  | InvalidMediaError
  | ExternalApiError
  | MergeWatchlistError
  | ConfigurationError;
