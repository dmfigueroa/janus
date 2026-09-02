import { Button } from "@chakra-ui/react";

type WatchlistPauseButtonProps = {
  isPaused: boolean;
  onTogglePause: () => void;
  disabled: boolean;
};

export function WatchlistPauseButton({
  isPaused,
  onTogglePause,
  disabled,
}: WatchlistPauseButtonProps) {
  const label = isPaused ? "Resume" : "Pause";

  return (
    <Button
      type="button"
      size="sm"
      variant={getPauseButtonVariant(isPaused)}
      colorPalette={getPauseButtonColorPalette(isPaused)}
      onClick={onTogglePause}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

function getPauseButtonVariant(isPaused: boolean) {
  if (isPaused) {
    return "solid" as const;
  }
  return "outline" as const;
}

function getPauseButtonColorPalette(isPaused: boolean) {
  if (isPaused) {
    return "pink" as const;
  }
  return "gray" as const;
}
