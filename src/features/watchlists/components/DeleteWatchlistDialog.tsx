import { DeleteWatchlistName } from "./DeleteWatchlistName";
import { Button, Dialog, Field, Input, Portal, Stack, Text } from "@chakra-ui/react";
import { X } from "lucide-react";
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
    setCopyStatus(await copyWatchlistName(watchlist.name));
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
          <Dialog.Content
            role="alertdialog"
            onClick={(event) => event.stopPropagation()}
            maxW={{ base: "calc(100% - 2rem)", sm: "md" }}
          >
            <Dialog.CloseTrigger aria-label="Close dialog" disabled={deleting}>
              <X size={16} />
            </Dialog.CloseTrigger>
            <Dialog.Header flexDirection="column" alignItems="flex-start" gap={2}>
              <Dialog.Title>Delete watchlist?</Dialog.Title>
              <Dialog.Description>
                This permanently deletes this watchlist and all its items. This cannot be undone.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body pb={4}>
              <Stack gap={5}>
                <DeleteWatchlistName
                  name={watchlist.name}
                  deleting={deleting}
                  copied={copyStatus === "Watchlist name copied"}
                  onCopy={copyName}
                />
                <Field.Root>
                  <Field.Label>Type the watchlist name to confirm</Field.Label>
                  <Input
                    focusRing="outside"
                    focusRingWidth="1px"
                    focusRingColor="border.emphasized"
                    ref={inputRef}
                    value={name}
                    disabled={deleting}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field.Root>
                <Text role="status" fontSize="sm" color="fg.muted" hidden={!copyStatus}>
                  {copyStatus}
                </Text>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer pt={2} aria-busy={deleting}>
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
                {deleting ? "Deleting..." : "Delete watchlist"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

async function copyWatchlistName(watchlistName: string) {
  try {
    await navigator.clipboard.writeText(watchlistName);
    return "Watchlist name copied";
  } catch {
    return "Could not copy the watchlist name. Please select and copy it manually.";
  }
}
