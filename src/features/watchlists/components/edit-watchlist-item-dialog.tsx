import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id={`edit-release-date-${item.id}`}
              type="button"
              variant="outline"
              className="justify-start text-left font-normal"
            >
              <CalendarIcon />
              {values.releaseDate
                ? format(parse(values.releaseDate, "yyyy-MM-dd", new Date()), "PPP")
                : "Select date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={
                values.releaseDate ? parse(values.releaseDate, "yyyy-MM-dd", new Date()) : undefined
              }
              defaultMonth={
                values.releaseDate ? parse(values.releaseDate, "yyyy-MM-dd", new Date()) : undefined
              }
              onSelect={(date) => setReleaseDate(date ? format(date, "yyyy-MM-dd") : "")}
            />
            {values.releaseDate ? (
              <Button
                type="button"
                variant="ghost"
                className="m-2 w-[calc(100%-1rem)]"
                onClick={() => setReleaseDate("")}
              >
                Clear date
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
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
        setTitle={(title) => setValues((current) => ({ ...current, title }))}
        setReleaseDate={(releaseDate) => setValues((current) => ({ ...current, releaseDate }))}
        errorMessage={errorMessage}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : "Save"}
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
