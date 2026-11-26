import { z } from "zod";

const YEAR_PATTERN = /^\d{4}$/;
const COMPLETE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidCivilDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function validateCompleteCalendarDate(value: string): string | null {
  if (!COMPLETE_DATE_PATTERN.test(value)) return "Release date must be YYYY or YYYY-MM-DD.";
  return isValidCivilDate(value) ? null : "Release date must be a valid calendar date.";
}

function releaseDateError(value: string): string | null {
  return YEAR_PATTERN.test(value) ? null : validateCompleteCalendarDate(value);
}

export const releaseDateSchema = z.string().superRefine((value, context) => {
  const message = releaseDateError(value);
  if (message) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});
