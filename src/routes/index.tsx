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
      <div className="max-w-md mx-auto min-h-screen relative">
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
          <div className="grid grid-cols-2 gap-x-4 gap-y-8">
            {watchlists.map((list) => (
              <WatchlistCard key={list.id} watchlist={list} />
            ))}

            {/* Always show the create card at the end */}
            <CreateWatchlistCard />
          </div>
        </section>

        {/* Floating Action Button (Mobile) */}
        <CreateWatchlistDialog />
      </div>
    </div>
  );
}
