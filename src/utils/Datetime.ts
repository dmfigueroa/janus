import { format, isValid, parse } from "date-fns";

const MISSING_RELEASE_DATE = "TBA";
const YEAR_PATTERN = /^\d{4}$/;
const REFERENCE_DATE = new Date(0);

type ReleaseDateFormat = {
  pattern: RegExp;
  inputFormat: string;
  withYear: string;
  withoutYear: string;
};

const RELEASE_DATE_FORMATS: Array<ReleaseDateFormat> = [
  {
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    inputFormat: "uuuu-MM-dd",
    withYear: "MMMM d, yyyy",
    withoutYear: "MMMM d",
  },
  {
    pattern: /^\d{4}-\d{2}$/,
    inputFormat: "uuuu-MM",
    withYear: "MMMM yyyy",
    withoutYear: "MMMM",
  },
];

export function formatReleaseDate(
  dateString: string | null | undefined,
  includeYear = false,
): string {
  if (!dateString) return MISSING_RELEASE_DATE;
  return formatRecognizedReleaseDate(dateString, includeYear);
}

function formatRecognizedReleaseDate(dateString: string, includeYear: boolean) {
  const releaseDateFormat = RELEASE_DATE_FORMATS.find(({ pattern }) => pattern.test(dateString));
  if (releaseDateFormat) {
    return formatParsedReleaseDate(dateString, releaseDateFormat, includeYear);
  }

  return YEAR_PATTERN.test(dateString) ? dateString : MISSING_RELEASE_DATE;
}

function formatParsedReleaseDate(
  dateString: string,
  releaseDateFormat: ReleaseDateFormat,
  includeYear: boolean,
) {
  const date = parse(dateString, releaseDateFormat.inputFormat, REFERENCE_DATE);
  if (!isValid(date)) return MISSING_RELEASE_DATE;

  return format(date, includeYear ? releaseDateFormat.withYear : releaseDateFormat.withoutYear);
}

export function formatRuntime(mins: number | null | undefined): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
