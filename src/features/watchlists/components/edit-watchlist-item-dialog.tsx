import { useEffect, useState, type FormEvent } from "react";
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

type EditWatchlistItemDialogProps = {
  item: WatchlistItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function useEditWatchlistItemForm(item: WatchlistItem, open: boolean) {
  const [values, setValues] = useState<EditWatchlistItemValues>(() => getInitialValues(item));

  useEffect(() => {
    if (open) {
      setValues(getInitialValues(item));
    }
  }, [item, open]);

  return {
    values,
    setTitle: (title: string) => setValues((current) => ({ ...current, title })),
    setReleaseDate: (releaseDate: string) => setValues((current) => ({ ...current, releaseDate })),
  };
}

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
  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor={`edit-title-${item.id}`}>Title</Label>
        <Input
          id={`edit-title-${item.id}`}
          value={values.title}
          onChange={(event) => setTitle(event.target.value)}
          required
          aria-invalid={values.title.trim().length === 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`edit-release-date-${item.id}`}>Release date</Label>
        <Input
          id={`edit-release-date-${item.id}`}
          type="date"
          value={values.releaseDate}
          onChange={(event) => setReleaseDate(event.target.value)}
        />
      </div>
      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
    </div>
  );
}

export function EditWatchlistItemDialog({
  item,
  open,
  onOpenChange,
}: EditWatchlistItemDialogProps) {
  const form = useEditWatchlistItemForm(item, open);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useEditWatchlistItemMutation(item);

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
    }
  }, [item, open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    mutation.mutate(form.values, {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit watchlist item</DialogTitle>
            <DialogDescription>Update this item’s title and release date.</DialogDescription>
          </DialogHeader>
          <EditWatchlistItemFields item={item} {...form} errorMessage={errorMessage} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
