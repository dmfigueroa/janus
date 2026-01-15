import { createFileRoute } from "@tanstack/react-router";
import { getWatchlists } from "@/server/watchlists";
import { WatchlistCard } from "@/components/WatchlistCard";
import { CreateWatchlistCard } from "@/components/CreateWatchlistCard";
import { CreateWatchlistDialog } from "@/components/CreateWatchlistDialog";
import { BottomNav } from "@/components/BottomNav";
import { SearchBar } from "@/components/SearchBar";
import { Settings, CheckCircle2, Clock } from "lucide-react";
import { useLoaderData } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export const Route = createFileRoute("/")({
  component: Index,
  loader: async () => await getWatchlists(),
});

function Index() {
  const watchlists = useLoaderData({ from: "/" });

  const tabs = [
    { label: "All Lists", active: true },
    { label: "In Progress", icon: Clock },
    { label: "Completed", icon: CheckCircle2 },
  ];

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

        {/* Filter Tabs */}
        <div className="px-6 mb-8 flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors",
                tab.active
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.icon && <tab.icon className="w-4 h-4" />}
              {tab.label}
            </button>
          ))}
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

        {/* Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
