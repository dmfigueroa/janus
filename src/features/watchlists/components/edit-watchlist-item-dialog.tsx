import type { WatchlistItem } from "@/db/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EditWatchlistItemForm } from "@/features/watchlists/components/edit-watchlist-item-form";

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
  const formKey = `${item.id}:${item.title}:${item.releaseDate ?? ""}:${open}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <EditWatchlistItemForm
          key={formKey}
          item={item}
          onSaved={() => onOpenChange(false)}
          onCanceled={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
