import { WatchlistCard } from "@/components/WatchlistCard";
import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { UpcomingWatchlistChips } from "@/features/watchlists/home/upcoming-watchlist-chips";

type FeaturedMediaSectionProps = {
  section: WatchlistHomeQueryData["featuredSections"][number];
};

export function FeaturedMediaSection({ section }: FeaturedMediaSectionProps) {
  return (
    <div>
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
      <UpcomingWatchlistChips watchlists={section.upcomingWatchlists} />
    </div>
  );
}
