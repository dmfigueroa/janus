import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { createWatchlist } from "@/server/watchlists";
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
import { cn } from "@/utils/cn";

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
      router.invalidate();
    } catch (error) {
      console.error("Failed to create watchlist", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asCard ? (
             <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-[#FF0055] transition-colors">
                    <Plus className="w-6 h-6 text-zinc-400 group-hover:text-white" />
                </div>
                <span className="text-zinc-500 font-medium group-hover:text-zinc-300">Create New List</span>
             </div>
        ) : (
            <Button size="icon" className="h-14 w-14 rounded-full shadow-lg bg-[#FF0055] hover:bg-[#FF0055]/90 text-white fixed bottom-24 right-6 z-40 md:hidden">
                <Plus className="w-7 h-7" />
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-[#1a1a1a] border-zinc-800 text-white">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New List</DialogTitle>
            <DialogDescription className="text-zinc-400">
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
                className="bg-zinc-900 border-zinc-700 focus-visible:ring-[#FF0055]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Optional description..."
                className="bg-zinc-900 border-zinc-700 focus-visible:ring-[#FF0055]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="bg-[#FF0055] hover:bg-[#D40046] text-white">
              {loading ? "Creating..." : "Create List"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
