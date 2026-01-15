import { useRouter } from "@tanstack/react-router";
import { deleteWatchlist } from "@/server/watchlists";
import type { Watchlist } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { toast } from "sonner";

interface WatchlistCardProps {
  watchlist: Watchlist;
  featured?: boolean; // Mock prop for size/emphasis
}

export function WatchlistCard({ watchlist, featured }: WatchlistCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  // Mocking visual data for the "demo" look
  const itemCount = Math.floor(Math.random() * 50) + 1;
  const progress = Math.floor(Math.random() * 100);
  // Using generic cinematic gradients as placeholders for now
  const gradients = [
    "bg-gradient-to-br from-indigo-900 to-purple-800",
    "bg-gradient-to-br from-rose-900 to-red-900",
    "bg-gradient-to-br from-slate-900 to-slate-700",
    "bg-gradient-to-br from-emerald-900 to-teal-800",
  ];
  const gradient = gradients[watchlist.id % gradients.length];

  const handleDelete = async () => {
    if (!confirm("Delete this list?")) return;
    setDeleting(true);
    try {
      await deleteWatchlist({ data: { id: watchlist.id } });
      router.invalidate();
      toast.success("Watchlist deleted successfully");
    } catch (error) {
      console.error("Failed to delete", error);
      toast.error("Failed to delete watchlist. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 group relative">
      <Card
        className={cn(
          "relative aspect-[2/3] overflow-hidden rounded-2xl border-none shadow-2xl transition-all duration-300 group-hover:scale-[1.02]",
          gradient,
        )}
      >
        {/* Mock Poster Art Placeholder */}
        <div className="absolute inset-0 bg-black/20" />

        {/* "Up Next" Badge Mockup */}
        <div className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-md shadow-lg">
          UP NEXT
        </div>

        {/* Poster Stack Effect (Visual flair) */}
        <div className="absolute right-3 bottom-3 bg-black/60 backdrop-blur-md rounded-full px-2 py-0.5 text-[10px] text-white font-medium border border-white/10">
          +{Math.floor(Math.random() * 20)} more
        </div>

        {/* Delete Button (Hidden till hover) */}
        <Button
          variant="destructive"
          size="icon"
          className="absolute top-2 right-2 w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          disabled={deleting}
        >
          <X className="w-4 h-4" />
        </Button>
      </Card>

      {/* Info Section */}
      <div className="px-1">
        <h3 className="font-bold text-lg text-foreground leading-tight truncate">
          {watchlist.name}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 mb-1">
          <span>{itemCount} items</span>
          <span>•</span>
          <span className={cn(progress === 100 ? "text-green-500" : "text-primary")}>
            {progress}%
          </span>
        </div>
        {/* Progress Bar */}
        <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full", progress === 100 ? "bg-green-500" : "bg-primary")}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
