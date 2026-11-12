import { Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { useEffect, useRef, type ReactNode } from "react";
import type { WatchlistItem } from "@/db/Schema";
import {
  useRemoveWatchlistItemMutation,
  useRemoveWatchlistParentMutation,
  type WatchlistRemovalPreview,
} from "./RemoveFromWatchlist";

type RemovalDialogProps = {
  item: WatchlistItem;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ItemRemovalDialog({ item, label, open, onOpenChange }: RemovalDialogProps) {
  const mutation = useRemoveWatchlistItemMutation({ item });
  const handleRemove = () => {
    void mutation
      .mutateAsync()
      .then(() => onOpenChange(false))
      .catch(() => undefined);
  };

  return (
    <RemovalDialogContent
      open={open}
      onOpenChange={onOpenChange}
      title={`${label}?`}
      description={
        <>
          This will remove <Text as="strong">{item.title}</Text> from this watchlist.
        </>
      }
      label={label}
      isPending={mutation.isPending}
      confirmDisabled={false}
      onConfirm={handleRemove}
    />
  );
}

export function ParentRemovalDialog({
  item,
  label,
  open,
  onOpenChange,
  previewQuery,
}: RemovalDialogProps & {
  previewQuery: {
    data?: WatchlistRemovalPreview;
    isLoading: boolean;
  };
}) {
  const mutation = useRemoveWatchlistParentMutation({
    item,
    preview: previewQuery.data,
  });
  const description = getParentRemovalDescription({
    parentTitle: item.parentTitle ?? item.title,
    preview: previewQuery.data,
    isLoading: previewQuery.isLoading,
  });
  const handleRemove = () => {
    void mutation
      .mutateAsync()
      .then(() => onOpenChange(false))
      .catch(() => undefined);
  };

  return (
    <RemovalDialogContent
      open={open}
      onOpenChange={onOpenChange}
      title={`${label}?`}
      description={description}
      label={label}
      isPending={mutation.isPending}
      confirmDisabled={previewQuery.isLoading}
      onConfirm={handleRemove}
    />
  );
}

function RemovalDialogContent({
  open,
  onOpenChange,
  title,
  description,
  label,
  isPending,
  confirmDisabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  label: string;
  isPending: boolean;
  confirmDisabled: boolean;
  onConfirm: () => void;
}) {
  const cancelButtonReference = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusTimeout = window.setTimeout(() => cancelButtonReference.current?.focus());
    return () => window.clearTimeout(focusTimeout);
  }, [open]);

  return (
    <Dialog.Root
      role="alertdialog"
      open={open}
      closeOnInteractOutside={false}
      initialFocusEl={() => cancelButtonReference.current}
      onOpenChange={({ open: nextOpen }) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW={{ base: "calc(100% - 2rem)", sm: "md" }}>
            <Dialog.Header flexDirection="column" alignItems="flex-start" gap={1}>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description color="fg.muted">{description}</Dialog.Description>
            </Dialog.Header>
            <Dialog.Footer
              aria-busy={isPending}
              aria-live="polite"
              flexDir={{ base: "column-reverse", sm: "row" }}
            >
              <Button
                ref={cancelButtonReference}
                variant="outline"
                w={{ base: "full", sm: "auto" }}
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                colorPalette="red"
                w={{ base: "full", sm: "auto" }}
                disabled={isPending || confirmDisabled}
                onClick={onConfirm}
              >
                {isPending ? "Removing…" : label}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function getParentRemovalDescription({
  parentTitle,
  preview,
  isLoading,
}: {
  parentTitle: string;
  preview?: { count: number; watchedCount: number };
  isLoading: boolean;
}) {
  if (isLoading) {
    return `Checking how many items from ${parentTitle} will be removed...`;
  }

  return preview
    ? `This will remove ${preview.count} items from ${parentTitle}, including ${preview.watchedCount} watched.`
    : `This will remove ${parentTitle} from this watchlist. The affected item count is unavailable.`;
}
