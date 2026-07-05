import { Plus } from "lucide-react";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";

export function CreateWatchlistTile() {
  return (
    <div className="w-full sm:w-[220px]">
      <div className="flex h-full flex-col gap-2">
        <WatchlistFormDialog
          mode="create"
          trigger={
            <div className="group flex aspect-[2/3] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-muted-foreground hover:bg-secondary/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary transition-colors group-hover:bg-primary">
                <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary-foreground" />
              </div>
              <span className="mt-2 font-medium text-muted-foreground group-hover:text-foreground">
                Create New List
              </span>
            </div>
          }
        />
        <div className="px-1 opacity-0">.</div>
      </div>
    </div>
  );
}
