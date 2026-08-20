import { useState } from "react";
import type { UnifiedMedia } from "@/server/Media";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

interface CreateCustomItemDialogProps {
  children?: React.ReactNode;
  onCreated: (media: UnifiedMedia) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function createCustomMedia(
  title: string,
  mediaType: UnifiedMedia["mediaType"],
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
    getFormValue(formData, "mediaType", "movie") as UnifiedMedia["mediaType"],
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
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const newMedia = createCustomMediaFromForm(event.currentTarget);

    onCreated(newMedia);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Custom Item</DialogTitle>
          <DialogDescription>
            Add an item that couldn't be found in the search results.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="e.g. My Favorite obscure movie" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select name="mediaType" defaultValue="movie">
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">Movie</SelectItem>
                  <SelectItem value="tv">TV Show</SelectItem>
                  <SelectItem value="book">Book</SelectItem>
                  <SelectItem value="game">Game</SelectItem>
                  <SelectItem value="comic">Comic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year (Optional)</Label>
              <Input id="year" name="year" placeholder="YYYY" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="overview">Description (Optional)</Label>
            <Textarea id="overview" name="overview" placeholder="Brief description..." />
          </div>
          <DialogFooter>
            <Button type="submit">Create Item</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
