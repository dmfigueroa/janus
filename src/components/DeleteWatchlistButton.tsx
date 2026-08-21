import { Button, Dialog, Portal } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useState } from "react";
import type { EnrichedWatchlist } from "./WatchlistCard";

type DeleteWatchlistButtonProps = {
  watchlist: EnrichedWatchlist;
  deleting: boolean;
  handleDelete: () => void;
};

export function DeleteWatchlistButton({
  watchlist,
  deleting,
  handleDelete,
}: DeleteWatchlistButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={({ open: nextOpen }) => setOpen(nextOpen)}>
      <Dialog.Trigger asChild>
        <Button
          aria-label={`Delete ${watchlist.name}`}
          position="absolute"
          top={2}
          right={2}
          zIndex={10}
          size="sm"
          minW="8"
          p={0}
          rounded="full"
          colorPalette="red"
          shadow="lg"
          opacity={{ base: 1, md: 0 }}
          _groupHover={{ opacity: 1 }}
          _focusVisible={{ opacity: 1 }}
          disabled={deleting}
        >
          <X size={16} />
        </Button>
      </Dialog.Trigger>
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
