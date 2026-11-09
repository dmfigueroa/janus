import { Button, Icon, IconButton, Popover, Portal, Stack } from "@chakra-ui/react";
import { ArrowRightFromLine, MoreHorizontal } from "lucide-react";
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

type ActionButtonProps = {
  label: string;
  onSelect: () => void;
  icon?: boolean;
};

function ActionButton({ label, onSelect, icon = false }: ActionButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      h="auto"
      justifyContent="flex-start"
      gap={2}
      py={2}
      whiteSpace="normal"
      textAlign="left"
      onClick={onSelect}
    >
      {icon ? <ArrowRightFromLine size={14} /> : null}
      {label}
    </Button>
  );
}

function ParentActionButtons({
  item,
  labels,
  onRemoveParent,
  onMoveParent,
}: Pick<TimelineItemActionMenuProps, "item" | "labels" | "onRemoveParent" | "onMoveParent">) {
  if (!item.parentId) {
    return null;
  }

  return (
    <>
      <ActionButton label={labels.parent} onSelect={onRemoveParent} />
      <ActionButton label={labels.moveParent} onSelect={onMoveParent} icon />
    </>
  );
}

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

  return (
    <Popover.Root
      open={open}
      onOpenChange={({ open: nextOpen }) => onOpenChange(nextOpen)}
      positioning={{ placement: "bottom-end", gutter: 4 }}
    >
      <Popover.Trigger asChild>
        <IconButton
          type="button"
          aria-label={`More actions for ${item.title}`}
          disabled={disabled}
          variant="ghost"
          size="sm"
          minW={11}
          h={11}
          flexShrink={0}
          rounded="full"
          color="fg.muted"
        >
          <Icon boxSize={4} asChild>
            <MoreHorizontal />
          </Icon>
        </IconButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="min(20rem, calc(100vw - 2rem))" p={1}>
            <Stack gap={1}>
              {item.isWatched !== true ? (
                <ActionButton
                  label="Mark watched without updating list"
                  onSelect={() => selectAction(onMarkWatched)}
                />
              ) : null}
              <ActionButton label="Edit" onSelect={() => selectAction(onEdit)} />
              <ActionButton label={labels.item} onSelect={() => selectAction(onRemoveItem)} />
              <ParentActionButtons
                item={item}
                labels={labels}
                onRemoveParent={() => selectAction(onRemoveParent)}
                onMoveParent={() => selectAction(onMoveParent)}
              />
              <ActionButton label="Move to..." onSelect={() => selectAction(onMoveItem)} icon />
            </Stack>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
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
