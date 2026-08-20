import { format } from "date-fns";

export function formatReleaseDate(dateString: string | null | undefined): string {
  if (!dateString) return "TBA";
  return formatKnownReleaseDate(dateString);
}

function formatKnownReleaseDate(dateString: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return formatFullReleaseDate(dateString);
  }
  if (/^\d{4}$/.test(dateString)) {
    return dateString;
  }

  return "TBA";
}

function formatFullReleaseDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) {
    return "TBA";
  }
  return format(date, "MMMM d");
}

export function formatRuntime(mins: number | null | undefined): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
