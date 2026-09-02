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
      variant={isPaused ? "solid" : "ghost"}
      colorPalette="pink"
      onClick={onTogglePause}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}
