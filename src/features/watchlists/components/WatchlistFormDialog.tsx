import type { Watchlist } from "@/db/Schema";
import { Button, Dialog, Field, Input, RadioGroup, Stack, Textarea } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useController, type Control } from "react-hook-form";
import { useState } from "react";
import { useWatchlistForm, type WatchlistFormValues } from "./useWatchlistForm";

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
  const { loading, onSubmit, register, control, formState } = useWatchlistForm(
    getFormOptions(mode, watchlist, open, () => setOpen(false)),
  );
  const labels = watchlistFormLabels[mode];

  return (
    <Dialog.Root open={open} onOpenChange={({ open: nextOpen }) => setOpen(nextOpen)}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="sm">
          <Dialog.CloseTrigger aria-label="Close dialog">
            <X size={16} />
          </Dialog.CloseTrigger>
          <form onSubmit={onSubmit}>
            <Dialog.Header flexDirection="column" alignItems="flex-start" gap={1}>
              <Dialog.Title>{labels.title}</Dialog.Title>
              <Dialog.Description color="fg.muted">{labels.descriptionLabel}</Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <Field.Root required invalid={Boolean(formState.errors.name)}>
                  <Field.Label htmlFor="name">Name</Field.Label>
                  <Input
                    id="name"
                    placeholder="e.g., Marvel Cinematic Universe"
                    {...register("name", { required: "Name is required" })}
                  />
                  <Field.ErrorText>{formState.errors.name?.message}</Field.ErrorText>
                </Field.Root>
                <Field.Root>
                  <Field.Label htmlFor="description">Description</Field.Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description..."
                    {...register("description")}
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Order</Field.Label>
                  <WatchlistOrderField control={control} />
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

function WatchlistOrderField({ control }: { control: Control<WatchlistFormValues> }) {
  const { field } = useController({ control, name: "itemOrderMode" });

  return (
    <RadioGroup.Root
      name={field.name}
      value={field.value}
      onValueChange={({ value }) => field.onChange(value)}
      colorPalette="pink"
      display="flex"
      flexDir="column"
      gap={2}
    >
      <RadioGroup.Item value="release">
        <RadioGroup.ItemHiddenInput ref={field.ref} />
        <RadioGroup.ItemControl borderWidth="2px" />
        <RadioGroup.ItemText>Release order</RadioGroup.ItemText>
      </RadioGroup.Item>
      <RadioGroup.Item value="custom">
        <RadioGroup.ItemHiddenInput />
        <RadioGroup.ItemControl borderWidth="2px" />
        <RadioGroup.ItemText>Custom order</RadioGroup.ItemText>
      </RadioGroup.Item>
    </RadioGroup.Root>
  );
}

function getFormOptions(
  mode: "create" | "edit",
  watchlist: Watchlist | undefined,
  open: boolean,
  onSuccess: () => void,
): Parameters<typeof useWatchlistForm>[0] {
  if (mode === "create") {
    return { mode, open, onSuccess };
  }

  return { mode, open, onSuccess, watchlist: watchlist as Watchlist };
}
