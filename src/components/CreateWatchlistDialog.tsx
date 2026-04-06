import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "@tanstack/react-router";
import { createWatchlist } from "@/features/watchlists/mutations";
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
import { Plus } from "lucide-react";

interface CreateWatchlistDialogProps {
  asCard?: boolean;
}

export function CreateWatchlistDialog({ asCard }: CreateWatchlistDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;

    try {
      await createWatchlist({ data: { name, description } });
      setOpen(false);
      await router.invalidate?.();
      toast.success("Watchlist created successfully");
    } catch (error) {
      console.error("Failed to create watchlist", error);
      toast.error("Failed to create watchlist. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asCard ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary transition-colors">
              <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary-foreground" />
            </div>
            <span className="text-muted-foreground font-medium group-hover:text-foreground">
              Create New List
            </span>
          </div>
        ) : (
          <Button
            size="icon"
            className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground fixed bottom-24 right-6 z-40 md:hidden"
          >
            <Plus className="w-7 h-7" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-popover border-border text-popover-foreground">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New List</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Create a new watchlist to track your movies and shows.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Marvel Cinematic Universe"
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
                className="bg-input border-border focus-visible:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {loading ? "Creating..." : "Create List"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
