import { z } from "zod";

const completeCalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Release date must be YYYY-MM-DD.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Release date must be a valid calendar date.");

export const releaseDateSchema = z.union([
  z.string().regex(/^\d{4}$/, "Release date must be YYYY or YYYY-MM-DD."),
  completeCalendarDate,
]);
