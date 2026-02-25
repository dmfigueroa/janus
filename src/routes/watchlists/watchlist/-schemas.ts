import { Schema } from "effect";

// TMDB Schemas
export const TmdbMovieSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  poster_path: Schema.NullOr(Schema.String),
  release_date: Schema.optional(Schema.String),
  vote_average: Schema.optional(Schema.Number),
  runtime: Schema.optional(Schema.Number),
});

export const TmdbEpisodeSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  season_number: Schema.Number,
  episode_number: Schema.Number,
  still_path: Schema.optional(Schema.String),
  air_date: Schema.optional(Schema.String),
  vote_average: Schema.optional(Schema.Number),
  runtime: Schema.optional(Schema.Number),
});

export const TmdbSeasonSchema = Schema.Struct({
  season_number: Schema.Number,
});

export const TmdbTVShowSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  poster_path: Schema.optional(Schema.String),
  seasons: Schema.optional(Schema.Array(TmdbSeasonSchema)),
});

export const TmdbSeasonDetailsSchema = Schema.Struct({
  episodes: Schema.Array(TmdbEpisodeSchema),
});

// AniList Schemas
export const AniListDetailsSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  poster: Schema.NullOr(Schema.String),
  releaseDate: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.Number),
  episodes: Schema.optional(Schema.Number),
  volumes: Schema.optional(Schema.Number),
  chapters: Schema.optional(Schema.Number),
});

// ComicVine Schemas
export const ComicVineIssueSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  issueNumber: Schema.String,
  poster: Schema.NullOr(Schema.String),
  coverDate: Schema.NullOr(Schema.String),
});

// Book Schemas (Google Books)
export const BookDetailsSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  poster: Schema.NullOr(Schema.String),
  releaseDate: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.Number),
});

// Game Schemas (RAWG)
export const GameDetailsSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  poster: Schema.NullOr(Schema.String),
  releaseDate: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.Number),
});

export type TmdbMovie = typeof TmdbMovieSchema.Type;
export type TmdbEpisode = typeof TmdbEpisodeSchema.Type;
export type TmdbTVShow = typeof TmdbTVShowSchema.Type;
export type TmdbSeasonDetails = typeof TmdbSeasonDetailsSchema.Type;
export type AniListDetails = typeof AniListDetailsSchema.Type;
export type ComicVineIssue = typeof ComicVineIssueSchema.Type;
export type BookDetails = typeof BookDetailsSchema.Type;
export type GameDetails = typeof GameDetailsSchema.Type;
