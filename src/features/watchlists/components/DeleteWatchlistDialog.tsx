import { Button, Dialog, Portal } from "@chakra-ui/react";
import { X } from "lucide-react";
import type { EnrichedWatchlist } from "./WatchlistCard";

type DeleteWatchlistDialogProps = {
  watchlist: EnrichedWatchlist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleting: boolean;
  handleDelete: () => void;
};

export function DeleteWatchlistDialog({
  watchlist,
  open,
  onOpenChange,
  deleting,
  handleDelete,
}: DeleteWatchlistDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={({ open: nextOpen }) => onOpenChange(nextOpen)}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content role="alertdialog" onClick={(event) => event.stopPropagation()} maxW="sm">
            <Dialog.CloseTrigger aria-label="Close dialog">
              <X size={16} />
            </Dialog.CloseTrigger>
            <Dialog.Header flexDirection="column" alignItems="flex-start" gap={1}>
              <Dialog.Title>Delete Watchlist</Dialog.Title>
              <Dialog.Description>
                Are you sure you want to delete &quot;{watchlist.name}&quot;? This action cannot be
                undone.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" onClick={(event) => event.stopPropagation()}>
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="red"
                disabled={deleting}
                onClick={(event) => {
                  event.stopPropagation();
                  handleDelete();
                }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
