import { Button, Dialog, Field, Image, Input, Stack, Text } from "@chakra-ui/react";
import { useState, type FormEvent } from "react";
import type { WatchlistItem } from "@/db/Schema";
import { ReleaseDateField } from "@/features/watchlists/components/ReleaseDateField";
import { posterPathSchema } from "@/features/watchlists/edit/Mutation";
import {
  useEditWatchlistItemMutation,
  type EditWatchlistItemValues,
} from "@/features/watchlists/edit/useEditWatchlistItemMutation";
import { buildMediaPosterUrl } from "@/utils/Tmdb";

type EditWatchlistItemFormProps = {
  item: WatchlistItem;
  onSaved: () => void;
  onCanceled: () => void;
};

function SaveButton({ isSaving }: { isSaving: boolean }) {
  return (
    <Button type="submit" disabled={isSaving} colorPalette="pink">
      {isSaving ? "Saving..." : "Save"}
    </Button>
  );
}

function PosterPreview({ posterPath, title }: { posterPath: string | null; title: string }) {
  if (!posterPath) {
    return null;
  }

  return (
    <Image
      src={buildMediaPosterUrl(posterPath)}
      alt={`Poster preview for ${title}`}
      h={36}
      w={24}
      rounded="md"
      objectFit="cover"
      referrerPolicy="no-referrer"
    />
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Text role="alert" fontSize="sm" color="status.error">
      {message}
    </Text>
  );
}

type EditFormSubmission =
  | { success: true; values: EditWatchlistItemValues }
  | { success: false; message: string };

function posterPathOrNull(value: string) {
  return value === "" ? null : value;
}

function posterPathOrEmpty(value: string | null) {
  return value ?? "";
}

function getPosterPreviewPath(value: string) {
  const result = posterPathSchema.safeParse(posterPathOrNull(value));
  return result.success ? result.data : null;
}

function readEditFormSubmission(formData: FormData): EditFormSubmission {
  const posterResult = posterPathSchema.safeParse(
    posterPathOrNull(String(formData.get("posterPath"))),
  );
  if (!posterResult.success) {
    return {
      success: false,
      message: posterResult.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return {
    success: true,
    values: {
      title: String(formData.get("title")),
      releaseDate: String(formData.get("releaseDate")),
      posterPath: posterResult.data,
    },
  };
}

function handleSaveResult(
  result: { success: true } | { success: false; message: string },
  onSaved: () => void,
  onError: (message: string) => void,
) {
  if (result.success) {
    onSaved();
  } else {
    onError(result.message);
  }
}

export function EditWatchlistItemForm({ item, onSaved, onCanceled }: EditWatchlistItemFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState(posterPathOrEmpty(item.posterPath));
  const mutation = useEditWatchlistItemMutation(item);
  const posterPreviewPath = getPosterPreviewPath(posterPath);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const submission = readEditFormSubmission(new FormData(event.currentTarget));
    if (!submission.success) {
      setErrorMessage(submission.message);
      return;
    }

    mutation.mutate(submission.values, {
      onSuccess: (result) => handleSaveResult(result, onSaved, setErrorMessage),
      onError: () => setErrorMessage("Failed to save changes. Please try again."),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Dialog.Header flexDirection="column" alignItems="flex-start" gap={1}>
        <Dialog.Title>Edit watchlist item</Dialog.Title>
        <Dialog.Description color="fg.muted">
          Update this item’s title, release date, and poster image.
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Body>
        <Stack gap={4}>
          <Field.Root required>
            <Field.Label htmlFor={`edit-title-${item.id}`}>Title</Field.Label>
            <Input id={`edit-title-${item.id}`} name="title" defaultValue={item.title} required />
          </Field.Root>
          <Field.Root>
            <Field.Label htmlFor={`edit-release-date-${item.id}`}>Release date</Field.Label>
            <ReleaseDateField
              inputId={`edit-release-date-${item.id}`}
              inputName="releaseDate"
              initialReleaseDate={item.releaseDate ?? ""}
            />
          </Field.Root>
          <Field.Root invalid={Boolean(errorMessage)}>
            <Field.Label htmlFor={`edit-poster-${item.id}`}>Poster image</Field.Label>
            <Input
              id={`edit-poster-${item.id}`}
              name="posterPath"
              value={posterPath}
              onChange={(event) => setPosterPath(event.target.value)}
            />
            <PosterPreview posterPath={posterPreviewPath} title={item.title} />
          </Field.Root>
          <FormError message={errorMessage} />
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCanceled}>
          Cancel
        </Button>
        <SaveButton isSaving={mutation.isPending} />
      </Dialog.Footer>
    </form>
  );
}
