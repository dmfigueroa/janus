import { useState } from "react";
import type { WatchlistItem } from "@/db/Schema";
import { useToggleWatchedItem } from "@/features/watchlists/detail/useToggleWatchedItem";
import { getTimelineItemActionLabels, TimelineItemActionMenu } from "./TimelineItemActionMenu";
import { TimelineItemDialogs, type OpenDialogs } from "./TimelineItemDialogs";

type TimelineItemActionsProps = {
  item: WatchlistItem;
  interactionDisabled?: boolean;
};

const noDialogsOpen: OpenDialogs = {
  edit: false,
  removeItem: false,
  removeParent: false,
  moveItem: false,
  moveParent: false,
};

export function TimelineItemActions({
  item,
  interactionDisabled = false,
}: TimelineItemActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDialogs, setOpenDialogs] = useState<OpenDialogs>(noDialogsOpen);
  const labels = getTimelineItemActionLabels(item);
  const quietWatchMutation = useToggleWatchedItem(item, { updateWatchlistRecency: false });
  const isBusy = [interactionDisabled, quietWatchMutation.isPending].some(Boolean);
  const openDialog = (dialogs: Partial<OpenDialogs>) => {
    setOpenDialogs({ ...noDialogsOpen, ...dialogs });
  };

  return (
    <>
      <TimelineItemActionMenu
        item={item}
        labels={labels}
        open={menuOpen}
        disabled={isBusy}
        onOpenChange={setMenuOpen}
        onMarkWatched={quietWatchMutation.mutate}
        onEdit={() => openDialog({ edit: true })}
        onRemoveItem={() => openDialog({ removeItem: true })}
        onRemoveParent={() => openDialog({ removeParent: true })}
        onMoveItem={() => openDialog({ moveItem: true })}
        onMoveParent={() => openDialog({ moveParent: true })}
      />

      <TimelineItemDialogs
        item={item}
        labels={labels}
        openDialogs={openDialogs}
        onOpenChange={openDialog}
      />
    </>
  );
}
