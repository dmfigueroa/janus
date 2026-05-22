import type { Watchlist } from "@/db/schema";
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
import { useWatchlistForm } from "./useWatchlistForm";

type WatchlistFormDialogProps =
  | { mode: "create"; watchlist?: never; trigger: React.ReactNode }
  | { mode: "edit"; watchlist: Watchlist; trigger: React.ReactNode };

export function WatchlistFormDialog({ mode, watchlist, trigger }: WatchlistFormDialogProps) {
  const form = useWatchlistForm(mode === "create" ? { mode } : { mode, watchlist });
  const { open, setOpen, loading, title, submitLabel, descriptionLabel, onSubmit } = form;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-popover border-border text-popover-foreground">
        <form onSubmit={onSubmit}>
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
