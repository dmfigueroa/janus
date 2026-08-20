import type { getWatchlistHome } from "@/features/watchlists/home/WatchlistHome";
import { FeaturedMediaSection } from "@/features/watchlists/home/FeaturedMediaSection";

type FeaturedMediaSectionsProps = {
  sections: Awaited<ReturnType<typeof getWatchlistHome>>["featuredSections"];
};

export function FeaturedMediaSections({ sections }: FeaturedMediaSectionsProps) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <section className="px-6 pb-8">
      <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">Up Next by Media</h2>
      <div className="space-y-8">
        {sections.map((section) => (
          <FeaturedMediaSection key={section.key} section={section} />
        ))}
      </div>
    </section>
  );
}
