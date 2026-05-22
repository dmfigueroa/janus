import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Watchlist } from "@/db/schema";
import { createWatchlist } from "@/features/watchlists/create/mutation";
import { updateWatchlist } from "@/features/watchlists/update/mutation";
import { invalidateWatchlistQueries } from "@/features/watchlists/cache";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface WatchlistFormDialogProps {
  mode: "create" | "edit";
  watchlist?: Watchlist;
  trigger: React.ReactNode;
}

export function WatchlistFormDialog({ mode, watchlist, trigger }: WatchlistFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const createWatchlistFn = useServerFn(createWatchlist);
  const updateWatchlistFn = useServerFn(updateWatchlist);

  const isCreate = mode === "create";
  const title = isCreate ? "Create New List" : "Edit List";
  const submitLabel = isCreate ? "Create List" : "Save Changes";
  const descriptionLabel = isCreate
    ? "Create a new watchlist to track your movies and shows."
    : "Update your watchlist details.";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const itemOrderMode = formData.get("itemOrderMode") as "release" | "custom";

    try {
      if (isCreate) {
        await createWatchlistFn({ data: { name, description, itemOrderMode } });
        toast.success("Watchlist created successfully");
      } else {
        const result = await updateWatchlistFn({
          data: {
            watchlistId: watchlist!.id,
            name,
            description,
            itemOrderMode,
          },
        });

        if (!result.success) {
          throw new Error(result.message);
        }

        toast.success("Changes saved successfully");
      }

      setOpen(false);
      await router.invalidate?.();
      invalidateWatchlistQueries(queryClient);
    } catch (error) {
      console.error("Failed to save watchlist", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save watchlist. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-popover border-border text-popover-foreground">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {descriptionLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Marvel Cinematic Universe"
                defaultValue={watchlist?.name ?? ""}
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
                defaultValue={watchlist?.description ?? ""}
                className="bg-input border-border focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-2">
              <Label>Order</Label>
              <RadioGroup
                name="itemOrderMode"
                defaultValue={watchlist?.itemOrderMode ?? "release"}
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
              {loading ? "Saving..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
