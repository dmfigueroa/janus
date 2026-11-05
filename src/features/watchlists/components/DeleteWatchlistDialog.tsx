import { Button, Dialog, Field, Input, Portal, Text } from "@chakra-ui/react";
import { Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type DeleteWatchlistDialogProps = {
  watchlist: { name: string };
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
  const [name, setName] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setCopyStatus("");
    }
  }, [open]);

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(watchlist.name);
      setCopyStatus("Watchlist name copied");
    } catch {
      setCopyStatus("Could not copy the watchlist name. Please select and copy it manually.");
    }
  };

  const changeOpen = (nextOpen: boolean) => {
    if (deleting) return;
    if (!nextOpen) setName("");
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root
      role="alertdialog"
      open={open}
      initialFocusEl={() => inputRef.current}
      onOpenChange={({ open: nextOpen }) => changeOpen(nextOpen)}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content role="alertdialog" onClick={(event) => event.stopPropagation()} maxW="sm">
            <Dialog.CloseTrigger aria-label="Close dialog" disabled={deleting}>
              <X size={16} />
            </Dialog.CloseTrigger>
            <Dialog.Header flexDirection="column" alignItems="flex-start" gap={1}>
              <Dialog.Title>Delete Watchlist</Dialog.Title>
              <Dialog.Description>
                The watchlist &quot;{watchlist.name}&quot; and all of its items will be permanently
                deleted and cannot be undone.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => void copyName()}
              >
                <Copy size={16} /> Copy name
              </Button>
              <Text role="status" fontSize="sm" color="fg.muted">
                {copyStatus}
              </Text>
              <Field.Root>
                <Field.Label>Type the watchlist name to confirm</Field.Label>
                <Input
                  ref={inputRef}
                  value={name}
                  disabled={deleting}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field.Root>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={(event) => event.stopPropagation()}
                >
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="red"
                disabled={deleting || name.trim() !== watchlist.name}
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
