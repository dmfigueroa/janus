import { Box, Button, Flex } from "@chakra-ui/react";
import { Check } from "lucide-react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { useToggleWatchedItem } from "@/features/watchlists/detail/useToggleWatchedItem";
import { TimelineItemActions } from "./TimelineItemActions";
import { TimelineItemContent, TimelineItemPoster } from "./TimelineItemPresentation";

type TimelineItemProps = {
  item: WatchlistItem;
  activeFilters?: WatchlistDetailQueryFilters;
  interactionDisabled?: boolean;
  itemOrderMode?: WatchlistItemOrderMode;
};

export function TimelineItem({
  item,
  activeFilters,
  interactionDisabled,
  itemOrderMode,
}: TimelineItemProps) {
  const toggleMutation = useToggleWatchedItem(item);
  const interactionsDisabled = Boolean(interactionDisabled);
  const isDisabled = [interactionsDisabled, toggleMutation.isPending].some(Boolean);
  const displayOrderMode = itemOrderMode ?? activeFilters?.itemOrderMode;

  return (
    <Flex
      position="relative"
      align="center"
      gap={{ base: 3, md: 4 }}
      py={{ base: 3, md: 4 }}
      pr={{ base: 2, md: 4 }}
      opacity={getWatchedOpacity(item.isWatched)}
      transition="opacity 200ms"
    >
      <TimelineItemPoster {...item} />
      <TimelineItemContent {...item} itemOrderMode={displayOrderMode} />

      <TimelineItemControls
        item={item}
        activeFilters={activeFilters}
        interactionDisabled={interactionsDisabled}
        isDisabled={isDisabled}
        onToggle={() => toggleMutation.mutate()}
      />
    </Flex>
  );
}

function TimelineItemControls({
  item,
  activeFilters,
  interactionDisabled,
  isDisabled,
  onToggle,
}: TimelineItemProps & { isDisabled: boolean; onToggle: () => void }) {
  return (
    <>
      <TimelineActionsSlot
        item={item}
        activeFilters={activeFilters}
        interactionDisabled={interactionDisabled}
      />
      <WatchedButton item={item} disabled={isDisabled} onToggle={onToggle} />
    </>
  );
}

function TimelineActionsSlot({
  item,
  activeFilters,
  interactionDisabled,
}: Pick<TimelineItemProps, "item" | "activeFilters" | "interactionDisabled">) {
  if (!activeFilters) return null;
  return (
    <TimelineItemActions
      item={item}
      activeFilters={activeFilters}
      interactionDisabled={interactionDisabled}
    />
  );
}

function WatchedButton({
  item,
  disabled,
  onToggle,
}: {
  item: WatchlistItem;
  disabled: boolean;
  onToggle: () => void;
}) {
  const watchedStyles = item.isWatched
    ? {
        borderColor: "accent.solid",
        color: "accent.contrast",
        bg: "accent.solid",
      }
    : { borderColor: "border.default", color: "transparent", bg: "transparent" };
  const label = item.isWatched ? `Mark ${item.title} unwatched` : `Mark ${item.title} watched`;
  return (
    <Button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={label}
      aria-pressed={Boolean(item.isWatched)}
      variant="ghost"
      size="sm"
      minW="44px"
      h="44px"
      p={0}
      flexShrink={0}
      rounded="md"
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        boxSize="20px"
        rounded="sm"
        borderWidth="1px"
        {...watchedStyles}
      >
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
      </Box>
    </Button>
  );
}

function getWatchedOpacity(isWatched: WatchlistItem["isWatched"]) {
  return isWatched ? 0.6 : 1;
}
