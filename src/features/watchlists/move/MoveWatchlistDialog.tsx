import { MoveWatchlistSession, type MoveWatchlistDialogProps } from "./MoveWatchlistSession";

export function MoveWatchlistDialog(props: MoveWatchlistDialogProps) {
  if (!props.open) return null;
  return <MoveWatchlistSession {...props} />;
}
