import { Box, Button, Flex, Icon } from "@chakra-ui/react";
import { Check } from "lucide-react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { useToggleWatchedItem } from "@/features/watchlists/detail/useToggleWatchedItem";
import { TimelineItemActions } from "./TimelineItemActions";
import { TimelineItemContent, TimelineItemPoster } from "./TimelineItemPresentation";

type TimelineItemProps = {
  item: WatchlistItem;
  interactionDisabled?: boolean;
  itemOrderMode?: WatchlistItemOrderMode;
};

export function TimelineItem({ item, interactionDisabled, itemOrderMode }: TimelineItemProps) {
  const toggleMutation = useToggleWatchedItem(item);
  const interactionsDisabled = Boolean(interactionDisabled);
  const isDisabled = [interactionsDisabled, toggleMutation.isPending].some(Boolean);

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
      <TimelineItemContent {...item} itemOrderMode={itemOrderMode} />

      <TimelineItemControls
        item={item}
        interactionDisabled={interactionsDisabled}
        isDisabled={isDisabled}
        onToggle={() => toggleMutation.mutate()}
      />
    </Flex>
  );
}

function TimelineItemControls({
  item,
  interactionDisabled,
  isDisabled,
  onToggle,
}: TimelineItemProps & { isDisabled: boolean; onToggle: () => void }) {
  return (
    <Flex align="center" gap={0} flexShrink={0}>
      <TimelineItemActions item={item} interactionDisabled={interactionDisabled} />
      <WatchedButton item={item} disabled={isDisabled} onToggle={onToggle} />
    </Flex>
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
      minW={11}
      h={11}
      p={0}
      flexShrink={0}
      rounded="md"
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        boxSize={6}
        rounded="sm"
        borderWidth="1px"
        {...watchedStyles}
      >
        <Icon boxSize={4} asChild>
          <Check strokeWidth={2.5} aria-hidden="true" />
        </Icon>
      </Box>
    </Button>
  );
}

function getWatchedOpacity(isWatched: WatchlistItem["isWatched"]) {
  return isWatched ? 0.6 : 1;
}
