export function buildMediaPosterUrl(path: string | null, size?: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/${posterSize(size)}${normalizePosterPath(path)}`;
}

function normalizePosterPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function posterSize(size: string | undefined) {
  return size === undefined ? "w500" : size;
}
