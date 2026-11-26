import { useState } from "react";
import type { UnifiedMedia } from "@/server/Media";
import {
  Button,
  Dialog,
  Field,
  Input,
  NativeSelect,
  Portal,
  Stack,
  Textarea,
} from "@chakra-ui/react";
import { X } from "lucide-react";
import { parseCustomMediaForm, type CustomItemFieldError } from "./CustomItemFormParser";

interface CreateCustomItemDialogProps {
  children?: React.ReactNode;
  onCreated: (media: UnifiedMedia) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function fieldMessage(
  error: CustomItemFieldError | null,
  field: CustomItemFieldError["field"],
): string {
  return error?.field === field ? error.message : "";
}

export function CreateCustomItemDialog({
  children,
  onCreated,
  open,
  onOpenChange,
}: CreateCustomItemDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [fieldError, setFieldError] = useState<CustomItemFieldError | null>(null);
  const isOpen = open ?? internalOpen;

  const setIsOpen = (nextOpen: boolean) => {
    setFieldError(null);
    if (open !== undefined) {
      onOpenChange?.(nextOpen);
      return;
    }
    setInternalOpen(nextOpen);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parseCustomMediaForm(event.currentTarget);
    if (!result.success) {
      setFieldError({ field: result.field, message: result.message });
      return;
    }
    onCreated(result.media);
    setIsOpen(false);
  };

  return (
    <Dialog.Root
      initialFocusEl={customTitleInput}
      open={isOpen}
      onOpenChange={({ open: nextOpen }) => setIsOpen(nextOpen)}
    >
      {children ? <Dialog.Trigger asChild>{children}</Dialog.Trigger> : null}
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW={{ base: "calc(100% - 2rem)", sm: "md" }}>
            <Dialog.CloseTrigger aria-label="Close dialog">
              <X size={16} />
            </Dialog.CloseTrigger>
            <Dialog.Header flexDirection="column" alignItems="flex-start" gap={1}>
              <Dialog.Title>Add custom item</Dialog.Title>
              <Dialog.Description color="fg.muted">
                Add an item that couldn't be found in the search results.
              </Dialog.Description>
            </Dialog.Header>
            <CustomItemForm
              fieldError={fieldError}
              onClearError={() => setFieldError(null)}
              onCancel={() => setIsOpen(false)}
              onSubmit={handleSubmit}
            />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function CustomItemForm({
  fieldError,
  onClearError,
  onCancel,
  onSubmit,
}: {
  fieldError: CustomItemFieldError | null;
  onClearError: () => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const titleError = fieldMessage(fieldError, "title");
  const yearError = fieldMessage(fieldError, "year");

  return (
    <form onSubmit={onSubmit}>
      <Dialog.Body>
        <Stack gap={4}>
          <Field.Root required invalid={Boolean(titleError)}>
            <Field.Label htmlFor="custom-item-title">Title</Field.Label>
            <Input
              id="custom-item-title"
              name="title"
              placeholder="e.g. My Favorite obscure movie"
              required
              onChange={onClearError}
            />
            <FieldErrorMessage message={titleError} />
          </Field.Root>
          <Stack direction={{ base: "column", sm: "row" }} gap={4}>
            <Field.Root flex={1}>
              <Field.Label htmlFor="custom-item-type">Type</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field id="custom-item-type" name="mediaType" defaultValue="movie">
                  <option value="movie">Movie</option>
                  <option value="tv">TV Show</option>
                  <option value="book">Book</option>
                  <option value="game">Game</option>
                  <option value="comic">Comic</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
            <Field.Root flex={1} invalid={Boolean(yearError)}>
              <Field.Label htmlFor="custom-item-year">Year (Optional)</Field.Label>
              <Input id="custom-item-year" name="year" placeholder="YYYY" onChange={onClearError} />
              <FieldErrorMessage message={yearError} />
            </Field.Root>
          </Stack>
          <Field.Root>
            <Field.Label htmlFor="custom-item-overview">Description (Optional)</Field.Label>
            <Textarea
              id="custom-item-overview"
              name="overview"
              placeholder="Brief description..."
            />
          </Field.Root>
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" colorPalette="pink">
          Create item
        </Button>
      </Dialog.Footer>
    </form>
  );
}

function FieldErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return <Field.ErrorText>{message}</Field.ErrorText>;
}

function customTitleInput() {
  return document.querySelector<HTMLInputElement>("#custom-item-title");
}
