import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mergeWatchlists } from "@/features/watchlists/merge/mutation";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { EnrichedWatchlist } from "./WatchlistCard";

interface MergeWatchlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedWatchlistIds: number[];
  allWatchlists: EnrichedWatchlist[];
  onSuccess?: () => void;
}

export function MergeWatchlistDialog({
  open,
  onOpenChange,
  selectedWatchlistIds,
  allWatchlists,
  onSuccess,
}: MergeWatchlistDialogProps) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState("");
  const [targetId, setTargetId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderedSourceWatchlistIds, setOrderedSourceWatchlistIds] = useState(selectedWatchlistIds);
  const router = useRouter();
  const mergeWatchlistsFn = useServerFn(mergeWatchlists);
  const selectedWatchlists = orderedSourceWatchlistIds.flatMap((watchlistId) => {
    const watchlist = allWatchlists.find((list) => list.id === watchlistId);
    return watchlist ? [watchlist] : [];
  });
  const hasCustomOrderedSelection = selectedWatchlists.some(
    (watchlist) => watchlist.itemOrderMode === "custom",
  );

  useEffect(() => {
    setOrderedSourceWatchlistIds(selectedWatchlistIds);
  }, [selectedWatchlistIds, open]);

  const moveSelectedWatchlist = (watchlistId: number, direction: "up" | "down") => {
    setOrderedSourceWatchlistIds((currentIds) => {
      const currentIndex = currentIds.indexOf(watchlistId);

      if (currentIndex === -1) {
        return currentIds;
      }

      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (nextIndex < 0 || nextIndex >= currentIds.length) {
        return currentIds;
      }

      const nextIds = [...currentIds];
      [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[currentIndex]];
      return nextIds;
    });
  };

  const handleMerge = async () => {
    try {
      setIsSubmitting(true);
      if (mode === "new") {
        if (!newName.trim()) {
          toast.error("Please enter a name for the new watchlist");
          return;
        }
        const result = await mergeWatchlistsFn({
          data: {
            sourceWatchlistIds: orderedSourceWatchlistIds,
            newWatchlistName: newName,
          },
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }
      } else {
        if (!targetId) {
          toast.error("Please select a target watchlist");
          return;
        }
        const result = await mergeWatchlistsFn({
          data: {
            sourceWatchlistIds: orderedSourceWatchlistIds,
            targetWatchlistId: parseInt(targetId, 10),
          },
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }
      }

      toast.success("Watchlists merged successfully");
      await router.invalidate?.();
      onSuccess?.();
      onOpenChange(false);
      // Reset state
      setNewName("");
      setTargetId("");
      setMode("new");
      setOrderedSourceWatchlistIds(selectedWatchlistIds);
    } catch (e) {
      console.error(e);
      toast.error("Failed to merge watchlists");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge Watchlists</DialogTitle>
          <DialogDescription>
            Merge {selectedWatchlistIds.length} lists. All items will be combined into the target
            list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Merge order</p>
              <p className="text-xs text-muted-foreground">
                {hasCustomOrderedSelection
                  ? "This order sets the final custom ranking when any selected list uses custom order."
                  : "This order is kept for the selected lists and release ordering still applies within each list."}
              </p>
            </div>

            <ol className="mt-3 space-y-2">
              {selectedWatchlists.map((watchlist, index) => (
                <li
                  key={watchlist.id}
                  data-testid={`merge-order-item-${watchlist.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{watchlist.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {watchlist.itemOrderMode === "custom" ? "Custom order" : "Release order"}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => moveSelectedWatchlist(watchlist.id, "up")}
                      disabled={isSubmitting || index === 0}
                      aria-label={`Move ${watchlist.name} up`}
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => moveSelectedWatchlist(watchlist.id, "down")}
                      disabled={isSubmitting || index === selectedWatchlists.length - 1}
                      aria-label={`Move ${watchlist.name} down`}
                    >
                      Down
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "new" | "existing")}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="new" id="r-new" />
              <Label htmlFor="r-new">Create a new watchlist</Label>
            </div>
            {mode === "new" && (
              <div className="ml-6">
                <Input
                  placeholder="New Watchlist Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <RadioGroupItem value="existing" id="r-existing" />
              <Label htmlFor="r-existing">Merge into existing watchlist</Label>
            </div>
            {mode === "existing" && (
              <div className="ml-6 space-y-2">
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target watchlist" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedWatchlists.map((list) => (
                      <SelectItem key={list.id} value={list.id.toString()}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The selected list will be kept. Other selected lists will be removed after
                  merging.
                </p>
              </div>
            )}
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={isSubmitting}>
            {isSubmitting ? "Merging..." : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
