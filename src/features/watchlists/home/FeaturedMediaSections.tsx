import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { FeaturedMediaSection } from "@/features/watchlists/home/FeaturedMediaSection";

type FeaturedMediaSectionsProps = {
  sections: WatchlistHomeData["featuredSections"];
};

export function FeaturedMediaSections({ sections }: FeaturedMediaSectionsProps) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <Box as="section" px={6} pb={8}>
      <Heading as="h2" size="xl" fontWeight="bold" letterSpacing="tight" mb={4}>
        Up Next by Media
      </Heading>
      <Stack gap={8}>
        <FeaturedMediaSectionItems sections={sections} />
      </Stack>
    </Box>
  );
}

function FeaturedMediaSectionItems({ sections }: FeaturedMediaSectionsProps) {
  return sections.map(FeaturedMediaSectionItem);
}

function FeaturedMediaSectionItem(section: FeaturedMediaSectionsProps["sections"][number]) {
  return <FeaturedMediaSection key={section.key} section={section} />;
}
import { Box, Heading, Stack } from "@chakra-ui/react";
