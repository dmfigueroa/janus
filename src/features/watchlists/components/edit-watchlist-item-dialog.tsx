import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { WatchlistItem } from "@/db/schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/cache";
import { editWatchlistItem } from "@/features/watchlists/edit/mutation";
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

export function EditWatchlistItemDialog({
  item,
  open,
  onOpenChange,
}: EditWatchlistItemDialogProps) {
  const [title, setTitle] = useState(item.title);
  const [releaseDate, setReleaseDate] = useState(item.releaseDate ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const editItemFn = useServerFn(editWatchlistItem);

  useEffect(() => {
    if (open) {
      setTitle(item.title);
      setReleaseDate(item.releaseDate ?? "");
      setErrorMessage(null);
    }
  }, [item, open]);

  const mutation = useMutation({
    mutationFn: () =>
      editItemFn({
        data: {
          watchlistId: item.watchlistId,
          itemId: item.id,
          title,
          releaseDate: releaseDate || null,
        },
      }),
    onSuccess: async (result) => {
      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }

      await invalidateWatchlistQueries(queryClient);
      onOpenChange(false);
    },
    onError: () => setErrorMessage("Failed to save changes. Please try again."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit watchlist item</DialogTitle>
            <DialogDescription>Update this item’s title and release date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor={`edit-title-${item.id}`}>Title</Label>
              <Input
                id={`edit-title-${item.id}`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                aria-invalid={title.trim().length === 0}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`edit-release-date-${item.id}`}>Release date</Label>
              <Input
                id={`edit-release-date-${item.id}`}
                type="date"
                value={releaseDate}
                onChange={(event) => setReleaseDate(event.target.value)}
              />
            </div>
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </div>
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
