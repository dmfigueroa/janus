import { Text } from "@chakra-ui/react";
import type { WatchlistItem } from "@/db/Schema";

export function ItemSequence({
  mediaType,
  source,
  season,
  episode,
}: Pick<WatchlistItem, "mediaType" | "source" | "season" | "episode">) {
  if (mediaType === "movie") return null;
  if (mediaType === "comic") return <ComicSequence episode={episode} />;
  return <EpisodeSequence source={source} season={season} episode={episode} />;
}

function ComicSequence({ episode }: Pick<WatchlistItem, "episode">) {
  if (!episode) return null;
  return <Text as="span">Issue #{episode}</Text>;
}

function EpisodeSequence({
  source,
  season,
  episode,
}: Pick<WatchlistItem, "source" | "season" | "episode">) {
  if (!episode) return null;
  const label = episodeLabel(source, season, episode);
  return <Text as="span">{label}</Text>;
}

function episodeLabel(source: WatchlistItem["source"], season: number | null, episode: string) {
  if (source === "custom") return episode;
  return season ? `S${season} E${episode}` : null;
}
