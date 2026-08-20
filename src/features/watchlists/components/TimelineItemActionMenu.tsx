import { ArrowRightFromLine, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import type { WatchlistItem } from "@/db/Schema";

export type TimelineItemActionLabels = ReturnType<typeof getTimelineItemActionLabels>;

type TimelineItemActionMenuProps = {
  item: WatchlistItem;
  labels: TimelineItemActionLabels;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkWatched: () => void;
  onEdit: () => void;
  onRemoveItem: () => void;
  onRemoveParent: () => void;
  onMoveItem: () => void;
  onMoveParent: () => void;
};

export function TimelineItemActionMenu({
  item,
  labels,
  open,
  disabled,
  onOpenChange,
  onMarkWatched,
  onEdit,
  onRemoveItem,
  onRemoveParent,
  onMoveItem,
  onMoveParent,
}: TimelineItemActionMenuProps) {
  const selectAction = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  const parentActions = item.parentId
    ? [
        { label: labels.parent, action: onRemoveParent },
        { label: labels.moveParent, action: onMoveParent, icon: true },
      ]
    : [];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${item.title}`}
          disabled={disabled}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground disabled:pointer-events-none"
        >
          <MoreHorizontal size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-1">
        <div className="flex flex-col gap-1">
          {item.isWatched !== true ? (
            <ActionButton label="Mark watched without updating list" onSelect={onMarkWatched} />
          ) : null}
          <ActionButton label="Edit" onSelect={onEdit} />
          <ActionButton label={labels.item} onSelect={onRemoveItem} />
          {parentActions.map((action) => (
            <ActionButton
              key={action.label}
              label={action.label}
              onSelect={action.action}
              icon={action.icon}
            />
          ))}
          <ActionButton label="Move to..." onSelect={onMoveItem} icon />
        </div>
      </PopoverContent>
    </Popover>
  );

  function ActionButton({
    label,
    onSelect,
    icon = false,
  }: {
    label: string;
    onSelect: () => void;
    icon?: boolean;
  }) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-auto justify-start gap-2 whitespace-normal py-2 text-left"
        onClick={() => selectAction(onSelect)}
      >
        {icon ? <ArrowRightFromLine size={14} /> : null}
        {label}
      </Button>
    );
  }
}

export function getTimelineItemActionLabels(item: Pick<WatchlistItem, "mediaType">) {
  if (item.mediaType === "episode") {
    return { item: "Remove episode", parent: "Remove show", moveParent: "Move show" };
  }

  if (item.mediaType === "comic") {
    return { item: "Remove issue", parent: "Remove volume", moveParent: "Move volume" };
  }

  return { item: "Remove item", parent: "Remove group", moveParent: "Move group" };
}
