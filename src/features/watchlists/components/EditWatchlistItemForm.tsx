import { useState, type FormEvent } from "react";
import type { WatchlistItem } from "@/db/Schema";
import { Button } from "@/components/ui/Button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { ReleaseDateField } from "@/features/watchlists/components/ReleaseDateField";
import { useEditWatchlistItemMutation } from "@/features/watchlists/edit/useEditWatchlistItemMutation";

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
          <Label htmlFor={`edit-title-${item.id}`}>Title</Label>
          <Input id={`edit-title-${item.id}`} name="title" defaultValue={item.title} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`edit-release-date-${item.id}`}>Release date</Label>
          <ReleaseDateField
            inputId={`edit-release-date-${item.id}`}
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
