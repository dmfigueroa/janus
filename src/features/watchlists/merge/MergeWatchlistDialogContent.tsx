import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { Button } from "@/components/ui/Button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { MergeWatchlistOrder } from "./MergeWatchlistOrder";

export type MergeDestinationMode = "new" | "existing";

interface MergeWatchlistDestinationProps {
  mode: MergeDestinationMode;
  newName: string;
  targetId: string;
  selectedWatchlists: WatchlistSummary[];
  onModeChange: (mode: MergeDestinationMode) => void;
  onNewNameChange: (name: string) => void;
  onTargetChange: (watchlistId: string) => void;
}

function MergeWatchlistDestination({
  mode,
  newName,
  targetId,
  selectedWatchlists,
  onModeChange,
  onNewNameChange,
  onTargetChange,
}: MergeWatchlistDestinationProps) {
  return (
    <RadioGroup value={mode} onValueChange={(value) => onModeChange(value as MergeDestinationMode)}>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="new" id="r-new" />
        <Label htmlFor="r-new">Create a new watchlist</Label>
      </div>
      {mode === "new" && (
        <div className="ml-6">
          <Input
            placeholder="New Watchlist Name"
            value={newName}
            onChange={(event) => onNewNameChange(event.target.value)}
          />
        </div>
      )}

      <div className="flex items-center space-x-2">
        <RadioGroupItem value="existing" id="r-existing" />
        <Label htmlFor="r-existing">Merge into existing watchlist</Label>
      </div>
      {mode === "existing" && (
        <div className="ml-6 space-y-2">
          <Select value={targetId} onValueChange={onTargetChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select target watchlist" />
            </SelectTrigger>
            <SelectContent>
              {selectedWatchlists.map((watchlist) => (
                <SelectItem key={watchlist.id} value={watchlist.id.toString()}>
                  {watchlist.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The selected list will be kept. Other selected lists will be removed after merging.
          </p>
        </div>
      )}
    </RadioGroup>
  );
}

interface MergeWatchlistDialogContentProps extends MergeWatchlistDestinationProps {
  selectedCount: number;
  hasCustomOrderedSelection: boolean;
  isSubmitting: boolean;
  onMove: (watchlistId: number, direction: "up" | "down") => void;
  onCancel: () => void;
  onMerge: () => void;
}

export function MergeWatchlistDialogContent({
  selectedCount,
  selectedWatchlists,
  hasCustomOrderedSelection,
  isSubmitting,
  onMove,
  onCancel,
  onMerge,
  ...destinationProps
}: MergeWatchlistDialogContentProps) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Merge Watchlists</DialogTitle>
        <DialogDescription>
          Merge {selectedCount} lists. All items will be combined into the target list.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <MergeWatchlistOrder
          watchlists={selectedWatchlists}
          hasCustomOrderedSelection={hasCustomOrderedSelection}
          isSubmitting={isSubmitting}
          onMove={onMove}
        />
        <MergeWatchlistDestination {...destinationProps} selectedWatchlists={selectedWatchlists} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={onMerge} disabled={isSubmitting}>
          {isSubmitting ? "Merging..." : "Merge"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
