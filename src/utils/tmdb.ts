const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function tmdbImageUrl(path: string | null, size = "w500"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${TMDB_IMAGE_BASE}/${size}${safePath}`;
}
