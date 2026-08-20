import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";

export function CreateWatchlistFloatingButton() {
  return (
    <WatchlistFormDialog
      mode="create"
      trigger={
        <Button
          size="icon"
          className="fixed bottom-24 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 md:hidden"
        >
          <Plus className="h-7 w-7" />
        </Button>
      }
    />
  );
}
