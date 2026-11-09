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

interface CreateCustomItemDialogProps {
  children?: React.ReactNode;
  onCreated: (media: UnifiedMedia) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type CreatableCustomMediaType = Exclude<UnifiedMedia["mediaType"], "episode">;

function createCustomMedia(
  title: string,
  mediaType: CreatableCustomMediaType,
  year: string,
  overview: string,
): UnifiedMedia {
  const optionalYear = year || undefined;

  return {
    id: `custom-${crypto.randomUUID()}`,
    title,
    mediaType,
    source: "custom",
    poster: null,
    year: optionalYear,
    releaseDate: optionalYear,
    overview: overview || undefined,
  };
}

function createCustomMediaFromForm(form: HTMLFormElement): UnifiedMedia {
  const formData = new FormData(form);

  return createCustomMedia(
    getFormValue(formData, "title"),
    getFormValue(formData, "mediaType", "movie") as CreatableCustomMediaType,
    getFormValue(formData, "year"),
    getFormValue(formData, "overview"),
  );
}

function getFormValue(formData: FormData, name: string, fallback = ""): string {
  return String(formData.get(name) ?? fallback);
}

export function CreateCustomItemDialog({
  children,
  onCreated,
  open,
  onOpenChange,
}: CreateCustomItemDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;

  const setIsOpen = (nextOpen: boolean) => {
    if (open !== undefined) {
      onOpenChange?.(nextOpen);
      return;
    }
    setInternalOpen(nextOpen);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreated(createCustomMediaFromForm(event.currentTarget));
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
            <form onSubmit={handleSubmit}>
              <Dialog.Body>
                <Stack gap={4}>
                  <Field.Root required>
                    <Field.Label htmlFor="custom-item-title">Title</Field.Label>
                    <Input
                      id="custom-item-title"
                      name="title"
                      placeholder="e.g. My Favorite obscure movie"
                      required
                    />
                  </Field.Root>
                  <Stack direction={{ base: "column", sm: "row" }} gap={4}>
                    <Field.Root flex={1}>
                      <Field.Label htmlFor="custom-item-type">Type</Field.Label>
                      <NativeSelect.Root>
                        <NativeSelect.Field
                          id="custom-item-type"
                          name="mediaType"
                          defaultValue="movie"
                        >
                          <option value="movie">Movie</option>
                          <option value="tv">TV Show</option>
                          <option value="book">Book</option>
                          <option value="game">Game</option>
                          <option value="comic">Comic</option>
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Field.Root>
                    <Field.Root flex={1}>
                      <Field.Label htmlFor="custom-item-year">Year (Optional)</Field.Label>
                      <Input id="custom-item-year" name="year" placeholder="YYYY" />
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
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" colorPalette="pink">
                  Create item
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function customTitleInput() {
  return document.querySelector<HTMLInputElement>("#custom-item-title");
}
