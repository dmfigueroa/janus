import { format } from "date-fns";

export function formatReleaseDate(dateString: string | null | undefined): string {
  if (!dateString) return "TBA";

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) {
      return format(date, "MMMM d");
    }
  } else if (/^\d{4}$/.test(dateString)) {
    return dateString;
  }

  return "TBA";
}

export function formatRuntime(mins: number | null | undefined): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
