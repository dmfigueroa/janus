export function buildMediaPosterUrl(path: string | null, size = "w500"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `https://image.tmdb.org/t/p/${size}${safePath}`;
}
