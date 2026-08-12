import { useState, type FormEvent } from "react";
import type { WatchlistItem } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReleaseDateField } from "@/features/watchlists/components/release-date-field";
import { useEditWatchlistItemMutation } from "@/features/watchlists/edit/use-edit-watchlist-item-mutation";

type EditWatchlistItemFormProps = {
  item: WatchlistItem;
  onSaved: () => void;
  onCanceled: () => void;
};

function SaveButton({ isSaving }: { isSaving: boolean }) {
  return (
    <Button type="submit" disabled={isSaving}>
      {isSaving ? "Saving..." : "Save"}
    </Button>
  );
}

export function EditWatchlistItemForm({ item, onSaved, onCanceled }: EditWatchlistItemFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useEditWatchlistItemMutation(item);
  const titleInputId = `edit-title-${item.id}`;
  const releaseDateInputId = `edit-release-date-${item.id}`;

  const handleCancel = () => {
    onCanceled();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    mutation.mutate(
      {
        title: String(formData.get("title") ?? ""),
        releaseDate: String(formData.get("releaseDate") ?? ""),
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            onSaved();
          } else {
            setErrorMessage(result.message);
          }
        },
        onError: () => setErrorMessage("Failed to save changes. Please try again."),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit watchlist item</DialogTitle>
        <DialogDescription>Update this item’s title and release date.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor={titleInputId}>Title</Label>
          <Input id={titleInputId} name="title" defaultValue={item.title} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={releaseDateInputId}>Release date</Label>
          <ReleaseDateField
            inputId={releaseDateInputId}
            inputName="releaseDate"
            initialReleaseDate={item.releaseDate ?? ""}
          />
        </div>
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <SaveButton isSaving={mutation.isPending} />
      </DialogFooter>
    </form>
  );
}
