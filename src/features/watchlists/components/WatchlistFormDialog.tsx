import {
  Button,
  Dialog,
  Field,
  Input,
  Portal,
  RadioGroup,
  Stack,
  Textarea,
} from "@chakra-ui/react";
import { X } from "lucide-react";
import { useController, type Control } from "react-hook-form";
import { useRef, useState } from "react";
import {
  useWatchlistForm,
  type UseWatchlistFormOptions,
  type WatchlistFormValues,
} from "./useWatchlistForm";

type WatchlistFormDialogProps = UseWatchlistFormOptions & {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const watchlistFormLabels = {
  create: {
    title: "Create watchlist",
    submitLabel: "Create watchlist",
    descriptionLabel: "Create a new watchlist to track your movies and shows.",
  },
  edit: {
    title: "Edit watchlist",
    submitLabel: "Save changes",
    descriptionLabel: "Update your watchlist details.",
  },
};

export function WatchlistFormDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  ...formOptions
}: WatchlistFormDialogProps) {
  const nameRef = useRef<HTMLDivElement>(null);
  const { open, setOpen } = useDialogOpen(controlledOpen, onOpenChange);
  const { loading, onSubmit, register, control, formState } = useWatchlistForm({
    ...formOptions,
    open,
    onSuccess: () => setOpen(false),
  });
  const labels = watchlistFormLabels[formOptions.mode];

  return (
    <Dialog.Root
      initialFocusEl={() => nameRef.current?.querySelector("input") ?? null}
      open={open}
      onOpenChange={({ open: nextOpen }) => {
        if (!loading) setOpen(nextOpen);
      }}
    >
      <OptionalDialogTrigger trigger={trigger} />
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content ref={nameRef} maxW="sm">
            <Dialog.CloseTrigger aria-label="Close dialog" disabled={loading}>
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
                      focusRingColor="pink.500"
                      placeholder="e.g., Marvel Cinematic Universe"
                      {...register("name", {
                        validate: (value) => value.trim().length > 0 || "Name is required",
                      })}
                    />
                    <Field.ErrorText>{formState.errors.name?.message}</Field.ErrorText>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label htmlFor="description">Description</Field.Label>
                    <Textarea
                      id="description"
                      focusRingColor="pink.500"
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
              <Dialog.Footer aria-busy={loading} aria-live="polite">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} colorPalette="pink">
                  {loading ? "Saving..." : labels.submitLabel}
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
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

function useDialogOpen(
  controlledOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
) {
  const [internalOpen, setInternalOpen] = useState(false);
  return { open: controlledOpen ?? internalOpen, setOpen: onOpenChange ?? setInternalOpen };
}
function OptionalDialogTrigger({ trigger }: { trigger: React.ReactNode }) {
  return trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null;
}
