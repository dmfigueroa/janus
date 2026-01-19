import { createFileRoute } from "@tanstack/react-router";
import { getWatchlists } from "@/server/watchlists";
import { WatchlistCard } from "@/components/WatchlistCard";
import { CreateWatchlistCard } from "@/components/CreateWatchlistCard";
import { CreateWatchlistDialog } from "@/components/CreateWatchlistDialog";
import { SearchBar } from "@/components/SearchBar";
import { Settings } from "lucide-react";
import { useLoaderData } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
  loader: async () => await getWatchlists(),
});

function Index() {
  const watchlists = useLoaderData({ from: "/" });

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-24">
      <div className="container mx-auto min-h-screen relative">
        {/* Header */}
        <header className="px-6 pt-8 pb-4 flex justify-between items-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">My Lists</h1>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full bg-card hover:bg-secondary text-muted-foreground"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </header>

        {/* Search */}
        <div className="px-6 mb-6">
          <SearchBar />
        </div>

        {/* Watchlists Grid */}
        <section className="px-6">
          <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:gap-6 sm:justify-start">
            {watchlists.map((list) => (
              <div key={list.id} className="w-full sm:w-[220px]">
                <WatchlistCard watchlist={list} />
              </div>
            ))}

            {/* Always show the create card at the end */}
            <div className="w-full sm:w-[220px]">
              <CreateWatchlistCard />
            </div>
          </div>
        </section>

        {/* Floating Action Button (Mobile) */}
        <CreateWatchlistDialog />
      </div>
    </div>
  );
}
