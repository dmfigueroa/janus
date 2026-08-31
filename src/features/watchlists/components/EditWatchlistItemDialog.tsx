import { CloseButton, Dialog, Portal } from "@chakra-ui/react";
import type { WatchlistItem } from "@/db/Schema";
import { EditWatchlistItemForm } from "@/features/watchlists/components/EditWatchlistItemForm";

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
    <Dialog.Root open={open} onOpenChange={({ open: nextOpen }) => onOpenChange(nextOpen)}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW={{ base: "calc(100% - 2rem)", sm: "lg" }}>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" aria-label="Close edit dialog" />
            </Dialog.CloseTrigger>
            <EditWatchlistItemForm
              key={formKey}
              item={item}
              onSaved={() => onOpenChange(false)}
              onCanceled={() => onOpenChange(false)}
            />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
