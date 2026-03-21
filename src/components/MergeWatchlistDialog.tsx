import { useState } from "react";
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
import { mergeWatchlists } from "@/controllers/watchlists";
import { useRouter } from "@tanstack/react-router";
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
  const router = useRouter();

  const handleMerge = async () => {
    try {
      setIsSubmitting(true);
      if (mode === "new") {
        if (!newName.trim()) {
          toast.error("Please enter a name for the new watchlist");
          return;
        }
        await mergeWatchlists({
          data: {
            sourceWatchlistIds: selectedWatchlistIds,
            newWatchlistName: newName,
          },
        });
      } else {
        if (!targetId) {
          toast.error("Please select a target watchlist");
          return;
        }
        await mergeWatchlists({
          data: {
            sourceWatchlistIds: selectedWatchlistIds,
            targetWatchlistId: parseInt(targetId),
          },
        });
      }

      toast.success("Watchlists merged successfully");
      await router.invalidate?.();
      onSuccess?.();
      onOpenChange(false);
      // Reset state
      setNewName("");
      setTargetId("");
      setMode("new");
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
                    {allWatchlists
                      .filter((list) => selectedWatchlistIds.includes(list.id))
                      .map((list) => (
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
