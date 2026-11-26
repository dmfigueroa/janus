import { useState } from "react";
import type { WatchlistItem } from "@/db/Schema";
import { useToggleWatchedItem } from "@/features/watchlists/detail/useToggleWatchedItem";
import { getTimelineItemActionLabels, TimelineItemActionMenu } from "./TimelineItemActionMenu";
import { TimelineItemDialogs, type ActiveItemDialog } from "./TimelineItemDialogs";

type TimelineItemActionsProps = {
  item: WatchlistItem;
  interactionDisabled?: boolean;
};

export function TimelineItemActions({
  item,
  interactionDisabled = false,
}: TimelineItemActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ActiveItemDialog | null>(null);
  const labels = getTimelineItemActionLabels(item);
  const quietWatchMutation = useToggleWatchedItem(item, { updateWatchlistRecency: false });
  const isBusy = [interactionDisabled, quietWatchMutation.isPending].some(Boolean);

  return (
    <>
      <TimelineItemActionMenu
        item={item}
        labels={labels}
        open={menuOpen}
        disabled={isBusy}
        onOpenChange={setMenuOpen}
        onMarkWatched={quietWatchMutation.mutate}
        onEdit={() => setActiveDialog("edit")}
        onRemoveItem={() => setActiveDialog("removeItem")}
        onRemoveParent={() => setActiveDialog("removeParent")}
        onMoveItem={() => setActiveDialog("moveItem")}
        onMoveParent={() => setActiveDialog("moveParent")}
      />

      <TimelineItemDialogs
        item={item}
        labels={labels}
        activeDialog={activeDialog}
        onClose={() => setActiveDialog(null)}
      />
    </>
  );
}
