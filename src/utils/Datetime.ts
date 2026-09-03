import { format } from "date-fns";

export function formatReleaseDate(
  dateString: string | null | undefined,
  includeYear = false,
): string {
  if (!dateString) return "TBA";
  return formatKnownReleaseDate(dateString, includeYear);
}

type ReleaseDateFormatter = (dateString: string, includeYear: boolean) => string;

function formatKnownReleaseDate(dateString: string, includeYear: boolean) {
  const formatters: Array<[RegExp, ReleaseDateFormatter]> = [
    [/^\d{4}-\d{2}-\d{2}$/, formatFullReleaseDate],
    [/^\d{4}-\d{2}$/, formatMonthReleaseDate],
  ];
  const formatter = formatters.find(([pattern]) => pattern.test(dateString))?.[1];

  return typeof formatter === "function"
    ? formatter(dateString, includeYear)
    : formatYearOrTba(dateString);
}

function formatYearOrTba(dateString: string) {
  return /^\d{4}$/.test(dateString) ? dateString : "TBA";
}

function formatFullReleaseDate(dateString: string, includeYear: boolean) {
  const [year, month, day] = dateString.split("-").map(Number);
  if (!isValidReleaseDay(year, month, day)) return "TBA";

  const date = createReleaseDate(year, month, day);
  return format(date, includeYear ? "MMMM d, yyyy" : "MMMM d");
}

function formatMonthReleaseDate(dateString: string, includeYear: boolean) {
  const [year, month] = dateString.split("-").map(Number);
  if (!isValidReleaseMonth(month)) return "TBA";

  const date = createReleaseDate(year, month, 1);
  return format(date, includeYear ? "MMMM yyyy" : "MMMM");
}

function isValidReleaseDay(year: number, month: number, day: number) {
  return day >= 1 && day <= getDaysInMonth(year, month);
}

function isValidReleaseMonth(month: number) {
  return month >= 1 && month <= 12;
}

function createReleaseDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getDaysInMonth(year: number, month: number) {
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysInMonth[month - 1] ?? 0;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function formatRuntime(mins: number | null | undefined): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
