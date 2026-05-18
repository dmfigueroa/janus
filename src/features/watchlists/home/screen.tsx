import { useState } from "react";
import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchlistCard } from "@/components/WatchlistCard";
import { CreateWatchlistCard } from "@/components/CreateWatchlistCard";
import { CreateWatchlistDialog } from "@/components/CreateWatchlistDialog";
import { MergeWatchlistDialog } from "@/components/MergeWatchlistDialog";
import type { WatchlistHomeScreen } from "@/features/watchlists/home/query.server";

type WatchlistsHomeScreenProps = {
  initialData: WatchlistHomeScreen;
};

export function WatchlistsHomeScreen({ initialData }: WatchlistsHomeScreenProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const selectedIdSet = new Set(selectedIds);

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    );
  };

  const handleMergeSuccess = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  return (
    <div className="min-h-screen bg-background pb-24 font-sans text-foreground">
      <div className="container relative mx-auto min-h-screen">
        <header className="flex items-center justify-between px-6 pb-4 pt-8">
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
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full bg-card text-muted-foreground hover:bg-secondary"
                onClick={() => setSelectionMode(true)}
                aria-label="Select watchlists"
                title="Select watchlists"
              >
                <CheckSquare className="h-5 w-5" />
              </Button>
            )}
          </div>
        </header>

        {!selectionMode && initialData.featuredSections.length > 0 ? (
          <section className="px-6 pb-8">
            <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">
              Up Next by Media
            </h2>
            <div className="space-y-8">
              {initialData.featuredSections.map((section) => (
                <div key={section.key}>
                  <h3 className="mb-3 text-lg font-semibold text-foreground">{section.title}</h3>
                  <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-start sm:gap-6">
                    {section.watchlists.map((watchlist) => (
                      <div key={watchlist.id} className="w-full sm:w-[220px]">
                        <WatchlistCard
                          watchlist={watchlist}
                          showDeleteButton={false}
                          showUpNextBadge={false}
                          showSkipButton
                          infoVariant="up-next"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="px-6">
          {!selectionMode ? (
            <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">
              All Watchlists
            </h2>
          ) : null}
          <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-start sm:gap-6">
            {initialData.allWatchlists.map((watchlist) => (
              <div key={watchlist.id} className="w-full sm:w-[220px]">
                <WatchlistCard
                  watchlist={watchlist}
                  selectionMode={selectionMode}
                  isSelected={selectedIdSet.has(watchlist.id)}
                  onToggle={() => toggleSelection(watchlist.id)}
                />
              </div>
            ))}

            {!selectionMode ? (
              <div className="w-full sm:w-[220px]">
                <CreateWatchlistCard />
              </div>
            ) : null}
          </div>
        </section>

        {!selectionMode ? <CreateWatchlistDialog /> : null}

        <MergeWatchlistDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          selectedWatchlistIds={selectedIds}
          allWatchlists={initialData.allWatchlists}
          onSuccess={handleMergeSuccess}
        />
      </div>
    </div>
  );
}
