import { z } from "zod";

const DECIMAL_ID = /^[1-9]\d*$/;
const SAFE_INTEGER_MESSAGE = "Provider ID must be a safe integer.";
const PROVIDER_RESOURCE_PATH_ERROR = "Provider resource path escaped its prefix.";

function decimalId(message: string) {
  return z
    .string()
    .regex(DECIMAL_ID, message)
    .refine((id) => Number.isSafeInteger(Number(id)), SAFE_INTEGER_MESSAGE);
}

export const rawgIdSchema = decimalId("Provider ID must be a positive decimal integer.").brand(
  "RawgId",
);
export const comicVineIdSchema = decimalId("Provider ID must be a positive decimal integer.").brand(
  "ComicVineId",
);
export const tmdbIdSchema = decimalId("Provider ID must be a TMDB numeric ID.").brand("TmdbId");
export const googleBooksIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "Provider ID must be a Google Books volume id.")
  .brand("GoogleBooksId");

export type RawgId = z.infer<typeof rawgIdSchema>;
export type ComicVineId = z.infer<typeof comicVineIdSchema>;
export type TmdbId = z.infer<typeof tmdbIdSchema>;
export type GoogleBooksId = z.infer<typeof googleBooksIdSchema>;

type ProviderResourceUrlInput = {
  prefix: string;
  segment: string;
  searchParams?: URLSearchParams;
  trailingSlash?: boolean;
};

export function providerResourceUrl(resource: ProviderResourceUrlInput): URL {
  const url = new URL(encodedSegment(resource.segment, resource.trailingSlash), resource.prefix);
  setSearchParams(url, resource.searchParams);
  assertProviderResourcePath(url, resource.prefix, resource.segment);
  return url;
}

function encodedSegment(segment: string, trailingSlash: boolean | undefined) {
  const encoded = encodeURIComponent(segment);
  if (trailingSlash) return `${encoded}/`;
  return encoded;
}

function setSearchParams(url: URL, searchParams: URLSearchParams | undefined) {
  if (!searchParams) return;
  url.search = searchParams.toString();
}

function assertProviderResourcePath(url: URL, prefix: string, segment: string) {
  assertResourcePrefix(url, new URL(prefix));
  assertResourceSegment(url, segment);
}

function assertResourcePrefix(url: URL, prefixUrl: URL) {
  if (url.origin !== prefixUrl.origin) throw new Error(PROVIDER_RESOURCE_PATH_ERROR);
  if (!url.pathname.startsWith(prefixUrl.pathname)) throw new Error(PROVIDER_RESOURCE_PATH_ERROR);
}

function assertResourceSegment(url: URL, segment: string) {
  if (resourceSegment(url) !== segment) throw new Error(PROVIDER_RESOURCE_PATH_ERROR);
}

function resourceSegment(url: URL) {
  const pathname = stripTrailingSlash(url.pathname);
  return pathname.slice(pathname.lastIndexOf("/") + 1);
}

function stripTrailingSlash(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}
