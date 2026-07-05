import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { FeaturedMediaSection } from "@/features/watchlists/home/featured-media-section";

type FeaturedMediaSectionsProps = {
  sections: WatchlistHomeQueryData["featuredSections"];
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
