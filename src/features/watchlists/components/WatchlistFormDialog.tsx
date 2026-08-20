import type { Watchlist } from "@/db/Schema";
import { Button, Dialog, Field, Input, RadioGroup, Stack, Textarea } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useState } from "react";
import { useWatchlistForm } from "./useWatchlistForm";

type WatchlistFormDialogProps =
  | { mode: "create"; watchlist?: never; trigger: React.ReactNode }
  | { mode: "edit"; watchlist: Watchlist; trigger: React.ReactNode };

const watchlistFormLabels = {
  create: {
    title: "Create New List",
    submitLabel: "Create List",
    descriptionLabel: "Create a new watchlist to track your movies and shows.",
  },
  edit: {
    title: "Edit List",
    submitLabel: "Save Changes",
    descriptionLabel: "Update your watchlist details.",
  },
};

export function WatchlistFormDialog({ mode, watchlist, trigger }: WatchlistFormDialogProps) {
  const [open, setOpen] = useState(false);
  const form = useWatchlistForm(getWatchlistFormOptions(mode, watchlist, () => setOpen(false)));
  const { loading, onSubmit } = form;
  const labels = watchlistFormLabels[mode];

  return (
    <Dialog.Root open={open} onOpenChange={({ open: nextOpen }) => setOpen(nextOpen)}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW={{ base: "calc(100vw - 2rem)", sm: "425px" }}>
          <Dialog.CloseTrigger aria-label="Close dialog">
            <X size={16} />
          </Dialog.CloseTrigger>
          <form key={open ? "open" : "closed"} onSubmit={onSubmit}>
            <Dialog.Header flexDirection="column" alignItems="flex-start" gap={1}>
              <Dialog.Title>{labels.title}</Dialog.Title>
              <Dialog.Description color="fg.muted">{labels.descriptionLabel}</Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <Field.Root required>
                  <Field.Label htmlFor="name">Name</Field.Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Marvel Cinematic Universe"
                    defaultValue={getWatchlistName(watchlist)}
                    required
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label htmlFor="description">Description</Field.Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Optional description..."
                    defaultValue={getWatchlistDescription(watchlist)}
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Order</Field.Label>
                  <RadioGroup.Root
                    name="itemOrderMode"
                    defaultValue={getWatchlistOrderMode(watchlist)}
                    colorPalette="pink"
                    display="flex"
                    flexDir="column"
                    gap={2}
                  >
                    <RadioGroup.Item value="release">
                      <RadioGroup.ItemHiddenInput />
                      <RadioGroup.ItemControl borderWidth="2px" />
                      <RadioGroup.ItemText>Release order</RadioGroup.ItemText>
                    </RadioGroup.Item>
                    <RadioGroup.Item value="custom">
                      <RadioGroup.ItemHiddenInput />
                      <RadioGroup.ItemControl borderWidth="2px" />
                      <RadioGroup.ItemText>Custom order</RadioGroup.ItemText>
                    </RadioGroup.Item>
                  </RadioGroup.Root>
                </Field.Root>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button type="submit" disabled={loading} colorPalette="pink">
                {loading ? "Saving..." : labels.submitLabel}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

function getWatchlistFormOptions(
  mode: "create" | "edit",
  watchlist: Watchlist | undefined,
  onSuccess: () => void,
): Parameters<typeof useWatchlistForm>[0] {
  if (mode === "create") {
    return { mode, onSuccess };
  }

  return { mode, watchlist: watchlist as Watchlist, onSuccess };
}

function getWatchlistName(watchlist: Watchlist | undefined) {
  return watchlist?.name ?? "";
}

function getWatchlistDescription(watchlist: Watchlist | undefined) {
  return watchlist?.description ?? "";
}

function getWatchlistOrderMode(watchlist: Watchlist | undefined) {
  return watchlist?.itemOrderMode ?? "release";
}
