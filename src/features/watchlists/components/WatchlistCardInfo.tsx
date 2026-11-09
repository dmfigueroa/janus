import { isWatchlistCompleted } from "../lifecycle/WatchlistLifecycle";
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

  return (
    <Box px={1}>
      <Heading as="h3" size="lg" fontWeight="bold" lineHeight="tight" truncate>
        {watchlist.name}
      </Heading>
      <Flex align="center" gap={2} mt={0.5} mb={1} fontSize="xs" color="fg.muted">
        <Text>
          {stats.watchedItems} of {stats.totalItems} watched
        </Text>
        <Text aria-hidden="true">•</Text>
        <ProgressPercentage stats={stats} />
      </Flex>

      <CardProgress stats={stats} />
      <NextItemLabel item={stats.nextUnwatched} />

      {watchlist.pausedAt ? <PausedSinceLine pausedAt={watchlist.pausedAt} /> : null}
    </Box>
  );
}

function CardProgress({ stats }: { stats: WatchlistSummary["stats"] }) {
  const complete = isWatchlistCompleted(stats);
  if (stats.watchedItems === 0) return null;
  return (
    <Box
      role="progressbar"
      aria-label="Watchlist progress"
      aria-valuenow={stats.progress}
      aria-valuemin={0}
      aria-valuemax={100}
      h={1}
      w="full"
      bg="bg.subtle"
      rounded="full"
      overflow="hidden"
    >
      <Box
        h="full"
        w={`${stats.progress}%`}
        bg={complete ? "green.500" : "accent.solid"}
        rounded="full"
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

function ProgressPercentage({ stats }: { stats: WatchlistSummary["stats"] }) {
  const color = isWatchlistCompleted(stats) ? "green.500" : "accent.solid";
  return <Text color={color}>{stats.progress}%</Text>;
}
function NextItemLabel({ item }: { item: WatchlistSummary["stats"]["nextUnwatched"] }) {
  if (!item) return null;
  const label = `Next: ${formatNextItemDetail(item)}`;
  return (
    <Text mt={1} fontSize="xs" color="fg.muted" lineClamp={2} title={label}>
      {label}
    </Text>
  );
}
