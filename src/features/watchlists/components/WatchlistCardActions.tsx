import { Box, Button } from "@chakra-ui/react";

type WatchlistCardActionsProps = {
  hasNextUnwatched: boolean;
  selectionMode: boolean;
  showUpNextBadge: boolean;
  showSkipButton: boolean;
  skipping: boolean;
  watchlistName: string;
  onSkip: () => void;
};

export function WatchlistCardActions(props: WatchlistCardActionsProps) {
  if (!hasActionsToShow(props)) {
    return null;
  }

  return (
    <Box
      position="absolute"
      left={3}
      right={3}
      top={3}
      zIndex={20}
      display="flex"
      alignItems="flex-start"
      gap={2}
      justifyContent={getActionAlignment(props.showUpNextBadge)}
    >
      <UpNextBadge show={props.showUpNextBadge} />
      <SkipButton {...props} />
    </Box>
  );
}

function hasActionsToShow({
  hasNextUnwatched,
  selectionMode,
  showUpNextBadge,
  showSkipButton,
}: WatchlistCardActionsProps) {
  const hasConfiguredAction = [showUpNextBadge, showSkipButton].some(Boolean);
  return !selectionMode && hasNextUnwatched && hasConfiguredAction;
}

function getActionAlignment(showUpNextBadge: boolean) {
  return showUpNextBadge ? "space-between" : "flex-end";
}

function UpNextBadge({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }

  return (
    <Box
      bg="accent.solid"
      color="accent.contrast"
      fontSize="xs"
      fontWeight="bold"
      px={2}
      py={1}
      rounded="sm"
      shadow="lg"
    >
      UP NEXT
    </Box>
  );
}

function SkipButton({
  showSkipButton,
  skipping,
  watchlistName,
  onSkip,
}: WatchlistCardActionsProps) {
  if (!showSkipButton) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="solid"
      bg="blackAlpha.600"
      color="white"
      fontSize="xs"
      fontWeight="bold"
      px={2}
      py={1}
      minW="auto"
      h="auto"
      rounded="sm"
      shadow="lg"
      _hover={{ bg: "blackAlpha.800" }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSkip();
      }}
      disabled={skipping}
      aria-label={`Skip ${watchlistName}`}
    >
      Skip
    </Button>
  );
}
