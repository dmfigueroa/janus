import { Box } from "@chakra-ui/react";

type WatchlistCardActionsProps = {
  hasNextUnwatched: boolean;
  selectionMode: boolean;
  showUpNextBadge: boolean;
};

export function WatchlistCardActions(props: WatchlistCardActionsProps) {
  const visible = props.hasNextUnwatched && props.showUpNextBadge && !props.selectionMode;

  return <UpNextBadgeOverlay visible={visible} />;
}

type UpNextBadgeOverlayProps = {
  visible: boolean;
};

function UpNextBadgeOverlay({ visible }: UpNextBadgeOverlayProps) {
  if (!visible) {
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
      justifyContent="flex-start"
    >
      <UpNextBadge />
    </Box>
  );
}

function UpNextBadge() {
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
