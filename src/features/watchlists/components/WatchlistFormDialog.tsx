import type { Watchlist } from "@/db/Schema";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-popover border-border text-popover-foreground">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {labels.descriptionLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Marvel Cinematic Universe"
                defaultValue={getWatchlistName(watchlist)}
                required
                className="bg-input border-border focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Optional description..."
                defaultValue={getWatchlistDescription(watchlist)}
                className="bg-input border-border focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-2">
              <Label>Order</Label>
              <RadioGroup
                name="itemOrderMode"
                defaultValue={getWatchlistOrderMode(watchlist)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="release" id="release" />
                  <Label htmlFor="release" className="cursor-pointer font-normal">
                    Release order
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom" className="cursor-pointer font-normal">
                    Custom order
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {loading ? "Saving..." : labels.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
