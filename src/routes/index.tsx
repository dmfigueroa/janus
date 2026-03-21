import { createFileRoute } from "@tanstack/react-router";
import { getWatchlistSummaries } from "@/controllers/watchlists";
import { WatchlistCard } from "@/components/WatchlistCard";
import { CreateWatchlistCard } from "@/components/CreateWatchlistCard";
import { CreateWatchlistDialog } from "@/components/CreateWatchlistDialog";
import { SearchBar } from "@/components/SearchBar";
import { Settings, CheckSquare } from "lucide-react";
import { useState } from "react";
import { MergeWatchlistDialog } from "@/components/MergeWatchlistDialog";

import { useLoaderData } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
  loader: async () =>
    await getWatchlistSummaries({ data: { orderBy: "lastWatched", order: "asc" } }),
});

function Index() {
  const watchlists = useLoaderData({ from: "/" });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleMergeSuccess = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-24">
      <div className="container mx-auto min-h-screen relative">
        {/* Header */}
        <header className="px-6 pt-8 pb-4 flex justify-between items-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {selectionMode ? `${selectedIds.length} Selected` : "My Lists"}
          </h1>
          <div className="flex gap-2">
            {selectionMode ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedIds([]);
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={selectedIds.length < 2} onClick={() => setMergeDialogOpen(true)}>
                  Merge
                </Button>
              </>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full bg-card hover:bg-secondary text-muted-foreground"
                  onClick={() => setSelectionMode(true)}
                  title="Select watchlists"
                >
                  <CheckSquare className="w-5 h-5" />
                </Button>
                {/* Kept Settings button for future use, though currently inert */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full bg-card hover:bg-secondary text-muted-foreground"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Search */}
        {!selectionMode && (
          <div className="px-6 mb-6">
            <SearchBar />
          </div>
        )}

        {/* Watchlists Grid */}
        <section className="px-6">
          <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:gap-6 sm:justify-start">
            {watchlists.map((list) => (
              <div key={list.id} className="w-full sm:w-[220px]">
                <WatchlistCard
                  watchlist={list}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.includes(list.id)}
                  onToggle={() => toggleSelection(list.id)}
                />
              </div>
            ))}

            {/* Always show the create card at the end unless in selection mode */}
            {!selectionMode && (
              <div className="w-full sm:w-[220px]">
                <CreateWatchlistCard />
              </div>
            )}
          </div>
        </section>

        {/* Floating Action Button (Mobile) */}
        {!selectionMode && <CreateWatchlistDialog />}

        <MergeWatchlistDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          selectedWatchlistIds={selectedIds}
          // Pass all watchlists as potential targets (or could filter out selectedIds? Logic is handled in dialog)
          allWatchlists={watchlists}
          onSuccess={handleMergeSuccess}
        />
      </div>
    </div>
  );
}
