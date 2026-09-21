import { Box, Flex, Image, Text } from "@chakra-ui/react";
import { Book, BookOpen, Film, Gamepad2, Tv } from "lucide-react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { formatReleaseDate, formatRuntime } from "@/utils/Datetime";
import { buildMediaPosterUrl } from "@/utils/Tmdb";
import { ItemSequence } from "./ItemSequence";

const mediaConfig = {
  movie: {
    label: "Movie",
    icon: Film,
    frame: { rounded: "lg", h: { base: 24, md: 32 }, w: { base: 16, md: 20 } },
  },
  episode: { label: null, icon: Tv, frame: { rounded: "md", h: { base: 12, md: 16 }, w: "full" } },
  game: {
    label: "Game",
    icon: Gamepad2,
    frame: { rounded: "lg", h: { base: 24, md: 32 }, w: { base: 16, md: 20 } },
  },
  book: {
    label: "Book",
    icon: Book,
    frame: { rounded: "lg", h: { base: 24, md: 32 }, w: { base: 16, md: 20 } },
  },
  comic: {
    label: "Comic",
    icon: BookOpen,
    frame: { rounded: "lg", h: { base: 24, md: 32 }, w: { base: 16, md: 20 } },
  },
} as const;

const defaultMediaConfig = {
  label: null,
  icon: Film,
  frame: { rounded: "lg", h: { base: 24, md: 32 }, w: { base: 16, md: 20 } },
} as const;

const getMediaConfig = (type: string) =>
  Object.prototype.hasOwnProperty.call(mediaConfig, type)
    ? mediaConfig[type as keyof typeof mediaConfig]
    : defaultMediaConfig;

export function TimelineItemPoster({ mediaType, posterPath, title }: WatchlistItem) {
  const config = getMediaConfig(mediaType);
  const posterUrl = buildMediaPosterUrl(posterPath, "w200");

  return (
    <Flex w={{ base: 20, md: 28 }} flexShrink={0} justify="center">
      <Box
        position="relative"
        flexShrink={0}
        overflow="hidden"
        fontWeight="bold"
        shadow="md"
        borderWidth="1px"
        borderColor="border.default"
        rounded={config.frame.rounded}
        h={config.frame.h}
        w={config.frame.w}
      >
        <PosterImage posterUrl={posterUrl} title={title} Icon={config.icon} />
        <MediaLabel label={config.label} />
      </Box>
    </Flex>
  );
}

function PosterImage({
  posterUrl,
  title,
  Icon,
}: {
  posterUrl: string;
  title: string;
  Icon: typeof Film;
}) {
  if (!posterUrl) {
    return (
      <Flex h="full" w="full" align="center" justify="center" bg="bg.subtle" color="fg.muted">
        <Icon size={20} />
      </Flex>
    );
  }
  return (
    <Image
      src={posterUrl}
      alt={title}
      h="full"
      w="full"
      objectFit="cover"
      referrerPolicy="no-referrer"
    />
  );
}

function MediaLabel({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <Box
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      bg="blackAlpha.700"
      px={1}
      py={0.5}
      textAlign="center"
      fontSize="10px"
      textTransform="uppercase"
      letterSpacing="wide"
      color="white"
      backdropFilter="blur(2px)"
    >
      {label}
    </Box>
  );
}

export function TimelineItemContent({
  parentTitle,
  title,
  mediaType,
  source,
  season,
  episode,
  releaseDate,
  runtime,
  authors,
  itemOrderMode,
}: WatchlistItem & { itemOrderMode?: WatchlistItemOrderMode }) {
  const formattedDate = formatReleaseDate(releaseDate, itemOrderMode === "custom");
  const formattedRuntime = formatRuntime(runtime);
  const runtimeText = formattedRuntime ? `• ${formattedRuntime}` : null;
  return (
    <Flex minW={0} flex={1} direction="column" justify="center" gap={1}>
      <ParentTitle title={parentTitle} />
      <Text
        as="h3"
        fontSize={{ base: "md", md: "lg" }}
        fontWeight="semibold"
        lineHeight="tight"
        color="fg.default"
      >
        {title}
      </Text>
      <BookAuthors mediaType={mediaType} authors={authors} />
      <Flex
        align="center"
        gap={{ base: 2, md: 3 }}
        fontSize={{ base: "xs", md: "sm" }}
        color="fg.muted"
      >
        <ItemSequence mediaType={mediaType} source={source} season={season} episode={episode} />
        <Text as="span">{formattedDate}</Text>
        <Text as="span">{runtimeText}</Text>
      </Flex>
    </Flex>
  );
}

function ParentTitle({ title }: { title: string | null }) {
  if (!title) return null;
  return (
    <Text
      fontSize="xs"
      fontWeight="medium"
      textTransform="uppercase"
      letterSpacing="wide"
      color="accent.solid"
    >
      {title}
    </Text>
  );
}

function BookAuthors({ mediaType, authors }: Pick<WatchlistItem, "mediaType" | "authors">) {
  if (mediaType !== "book") return null;
  return <Authors authors={authors} />;
}

function Authors({ authors }: Pick<WatchlistItem, "authors">) {
  if (!authors?.length) return null;
  const authorNames = authors.join(", ");
  return (
    <Text fontSize="xs" color="fg.muted">
      {authorNames}
    </Text>
  );
}
