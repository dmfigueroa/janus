import { useState, type ChangeEvent, type FormEvent } from "react";
import type { WatchlistItem } from "@/db/schema";
import {
  type EditWatchlistItemValues,
  useEditWatchlistItemMutation,
} from "@/features/watchlists/edit/use-edit-watchlist-item-mutation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReleaseDateField } from "@/features/watchlists/components/release-date-field";

type EditWatchlistItemDialogProps = {
  item: WatchlistItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function getInitialValues(item: WatchlistItem): EditWatchlistItemValues {
  return {
    title: item.title,
    releaseDate: item.releaseDate ?? "",
  };
}

function EditWatchlistItemFields({
  item,
  values,
  setTitle,
  setReleaseDate,
  errorMessage,
}: {
  item: WatchlistItem;
  values: EditWatchlistItemValues;
  setTitle: (title: string) => void;
  setReleaseDate: (releaseDate: string) => void;
  errorMessage: string | null;
}) {
  const titleInputId = `edit-title-${item.id}`;
  const releaseDateInputId = `edit-release-date-${item.id}`;
  const titleIsInvalid = values.title.trim().length === 0;

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor={titleInputId}>Title</Label>
        <Input
          id={titleInputId}
          value={values.title}
          onChange={handleTitleChange}
          required
          aria-invalid={titleIsInvalid}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={releaseDateInputId}>Release date</Label>
        <ReleaseDateField
          inputId={releaseDateInputId}
          releaseDate={values.releaseDate}
          setReleaseDate={setReleaseDate}
        />
      </div>
      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
    </div>
  );
}

function EditWatchlistItemForm({
  item,
  onOpenChange,
}: Pick<EditWatchlistItemDialogProps, "item" | "onOpenChange">) {
  const [values, setValues] = useState<EditWatchlistItemValues>(() => getInitialValues(item));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useEditWatchlistItemMutation(item);
  const isSaving = mutation.isPending;

  const handleTitleChange = (nextTitle: string) => {
    setValues((current) => ({ ...current, title: nextTitle }));
  };

  const handleReleaseDateChange = (nextReleaseDate: string) => {
    setValues((current) => ({ ...current, releaseDate: nextReleaseDate }));
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    mutation.mutate(values, {
      onSuccess: (result) => {
        if (result.success) {
          onOpenChange(false);
        } else {
          setErrorMessage(result.message);
        }
      },
      onError: () => setErrorMessage("Failed to save changes. Please try again."),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit watchlist item</DialogTitle>
        <DialogDescription>Update this item’s title and release date.</DialogDescription>
      </DialogHeader>
      <EditWatchlistItemFields
        item={item}
        values={values}
        setTitle={handleTitleChange}
        setReleaseDate={handleReleaseDateChange}
        errorMessage={errorMessage}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditWatchlistItemDialog({
  item,
  open,
  onOpenChange,
}: EditWatchlistItemDialogProps) {
  const formKey = `${item.id}:${item.title}:${item.releaseDate ?? ""}:${open}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <EditWatchlistItemForm key={formKey} item={item} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
