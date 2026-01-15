import { CreateWatchlistDialog } from "./CreateWatchlistDialog";

// Wrapper to make the dialog look like a card in the grid
export function CreateWatchlistCard() {
  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="aspect-[2/3] rounded-2xl border-2 border-dashed border-border hover:border-muted-foreground hover:bg-secondary/40 transition-colors flex flex-col items-center justify-center p-6 text-center cursor-pointer group">
        <CreateWatchlistDialog asCard />
      </div>
      <div className="px-1 opacity-0">.</div> {/* Spacer for alignment */}
    </div>
  );
}
