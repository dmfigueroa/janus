import { releaseDateSchema } from "@/features/watchlists/ReleaseDate";
import type { UnifiedMedia } from "@/server/Media";

type CreatableCustomMediaType = Exclude<UnifiedMedia["mediaType"], "episode">;

export type CustomItemFieldError = { field: "title" | "year"; message: string };

export type CustomMediaFormResult =
  | { success: true; media: UnifiedMedia }
  | ({ success: false } & CustomItemFieldError);

function createCustomMedia(
  title: string,
  mediaType: CreatableCustomMediaType,
  releaseDate: string | undefined,
  overview: string,
): UnifiedMedia {
  return {
    id: `custom-${crypto.randomUUID()}`,
    title,
    mediaType,
    source: "custom",
    poster: null,
    year: releaseDate?.slice(0, 4),
    releaseDate,
    overview: overview || undefined,
  };
}

function firstIssueMessage(issues: ReadonlyArray<{ message: string }>): string {
  return issues[0]?.message ?? "Release date must be YYYY or YYYY-MM-DD.";
}

function parseOptionalReleaseDate(
  rawValue: string,
): { success: true; value: string | undefined } | { success: false; message: string } {
  if (!rawValue) return { success: true, value: undefined };
  const parsed = releaseDateSchema.safeParse(rawValue);
  return parsed.success
    ? { success: true, value: parsed.data }
    : { success: false, message: firstIssueMessage(parsed.error.issues) };
}

function getFormValue(formData: FormData, name: string, fallback = ""): string {
  return String(formData.get(name) ?? fallback);
}

export function parseCustomMediaForm(form: HTMLFormElement): CustomMediaFormResult {
  const formData = new FormData(form);
  const title = getFormValue(formData, "title").trim();
  if (!title) return { success: false, field: "title", message: "Title is required." };

  const parsedReleaseDate = parseOptionalReleaseDate(getFormValue(formData, "year").trim());
  if (!parsedReleaseDate.success) {
    return { success: false, field: "year", message: parsedReleaseDate.message };
  }

  return {
    success: true,
    media: createCustomMedia(
      title,
      getFormValue(formData, "mediaType", "movie") as CreatableCustomMediaType,
      parsedReleaseDate.value,
      getFormValue(formData, "overview").trim(),
    ),
  };
}
