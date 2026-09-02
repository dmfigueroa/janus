import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { format, parseISO } from "date-fns";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { formatNextItemDetail } from "@/features/watchlists/NextItemLabel";

export type WatchlistCardInfoVariant = "watchlist" | "up-next";

function formatUpNextSubtitleItem(watchlist: WatchlistSummary) {
  const nextItem = watchlist.stats.nextUnwatched;
  if (!nextItem) {
    return null;
  }

  return formatNextItemDetail(nextItem);
}

export function WatchlistCardInfo({
  watchlist,
  infoVariant,
}: {
  watchlist: WatchlistSummary;
  infoVariant: WatchlistCardInfoVariant;
}) {
  if (infoVariant === "up-next") {
    return <UpNextCardInfo watchlist={watchlist} />;
  }

  return <StandardCardInfo watchlist={watchlist} />;
}

function UpNextCardInfo({ watchlist }: { watchlist: WatchlistSummary }) {
  const nextItem = watchlist.stats.nextUnwatched;
  const featuredTitle = getFeaturedTitle(nextItem, watchlist.name);
  const featuredSubtitle = nextItem?.parentTitle ? formatUpNextSubtitleItem(watchlist) : null;

  return (
    <Box px={1}>
      <Heading as="h3" size="lg" fontWeight="bold" lineHeight="tight">
        {featuredTitle}
      </Heading>
      <FeaturedSubtitle subtitle={featuredSubtitle} />
    </Box>
  );
}

function getFeaturedTitle(
  nextItem: WatchlistSummary["stats"]["nextUnwatched"],
  watchlistName: string,
) {
  if (!nextItem) {
    return watchlistName;
  }

  return getPreferredTitle(nextItem.parentTitle, nextItem.title, watchlistName);
}

function getPreferredTitle(parentTitle: string | null, title: string | null, fallback: string) {
  return parentTitle ?? title ?? fallback;
}

function FeaturedSubtitle({ subtitle }: { subtitle: string | null }) {
  if (!subtitle) {
    return null;
  }

  return (
    <Text mt={0.5} fontSize="sm" lineHeight="snug" color="fg.muted">
      {subtitle}
    </Text>
  );
}

function StandardCardInfo({ watchlist }: { watchlist: WatchlistSummary }) {
  const stats = watchlist.stats;
  const complete = stats.progress === 100;

  return (
    <Box px={1}>
      <Heading as="h3" size="lg" fontWeight="bold" lineHeight="tight" truncate>
        {watchlist.name}
      </Heading>
      <Flex align="center" gap={2} mt={0.5} mb={1} fontSize="xs" color="fg.muted">
        <Text>{stats.totalItems} items</Text>
        <Text aria-hidden="true">•</Text>
        <Text color={complete ? "green.500" : "accent.solid"}>{stats.progress}%</Text>
      </Flex>

      <CardProgress stats={stats} />

      {watchlist.pausedAt ? <PausedSinceLine pausedAt={watchlist.pausedAt} /> : null}
    </Box>
  );
}

function CardProgress({ stats }: { stats: WatchlistSummary["stats"] }) {
  const complete = stats.progress === 100;

  return (
    <Box h={1} w="full" bg="bg.subtle" rounded="full" overflow="hidden">
      <Box
        h="full"
        w={`${stats.progress}%`}
        bg={complete ? "green.500" : "accent.solid"}
        rounded="full"
        transition="width 500ms"
      />
    </Box>
  );
}

function PausedSinceLine({ pausedAt }: { pausedAt: string }) {
  const pausedDate = formatUtcTimestamp(pausedAt, "MMMM d, yyyy");
  return (
    <Text mt={1} fontSize="xs" color="fg.muted">
      Paused since {pausedDate}
    </Text>
  );
}

function formatUtcTimestamp(timestamp: string, pattern: string) {
  return format(parseISO(`${timestamp}Z`), pattern);
}
