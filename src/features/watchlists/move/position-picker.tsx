import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { InsertionPosition } from "@/features/watchlists/order-insert.server";

type PositionPickerProps = {
  value: InsertionPosition;
  onChange: (value: InsertionPosition) => void;
};

const ID_PREFIX = "move-insert-";

export function PositionPicker({ value, onChange }: PositionPickerProps) {
  return (
    <div className="space-y-3 rounded-md border bg-secondary/20 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Insert position</p>
        <p className="text-xs text-muted-foreground">
          Choose where this item should land in the watchlist&apos;s manual sequence.
        </p>
      </div>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as InsertionPosition)}>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${ID_PREFIX}beginning`} value="beginning" />
          <Label htmlFor={`${ID_PREFIX}beginning`}>Beginning</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${ID_PREFIX}end`} value="end" />
          <Label htmlFor={`${ID_PREFIX}end`}>End</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${ID_PREFIX}release-adjacent`} value="release-adjacent" />
          <Label htmlFor={`${ID_PREFIX}release-adjacent`}>Release-adjacent</Label>
        </div>
      </RadioGroup>
    </div>
  );
}
