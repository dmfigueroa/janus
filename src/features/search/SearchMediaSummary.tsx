import DOMPurify from "dompurify";
import { Calendar, Star } from "lucide-react";
import { Box, Drawer, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { UnifiedMedia } from "@/server/Media";

function MediaBackdrop({ title, backdrop }: Pick<UnifiedMedia, "title" | "backdrop">) {
  if (!backdrop) return null;

  return (
    <Box
      position="relative"
      mx={{ base: -6, sm: -8 }}
      mt={{ base: -6, sm: -8 }}
      mb={4}
      aspectRatio="video"
      overflow="hidden"
    >
      <Box
        position="absolute"
        inset={0}
        zIndex={1}
        bgGradient="to-t"
        gradientFrom="bg.surface"
        gradientTo="transparent"
      />
      <img
        src={backdrop}
        alt={title}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        referrerPolicy="no-referrer"
      />
    </Box>
  );
}

function MediaPoster({
  title,
  poster,
  backdrop,
}: Pick<UnifiedMedia, "title" | "poster" | "backdrop">) {
  if (!poster || backdrop) return null;

  return (
    <img
      src={poster}
      alt={title}
      width={96}
      style={{ width: "6rem", borderRadius: "var(--chakra-radii-md)" }}
      referrerPolicy="no-referrer"
    />
  );
}

function getDisplayYear(year: UnifiedMedia["year"]) {
  return year || "TBA";
}

function getDisplayRating(rating: UnifiedMedia["rating"]) {
  if (rating) return rating.toFixed(1);
  return "N/A";
}

function getDisplayMediaType(mediaType: UnifiedMedia["mediaType"]) {
  if (mediaType === "tv") return "TV Series";
  return mediaType;
}

function MediaMetadata({ media }: { media: UnifiedMedia }) {
  const displayYear = getDisplayYear(media.year);
  const displayRating = getDisplayRating(media.rating);
  const displayMediaType = getDisplayMediaType(media.mediaType);

  return (
    <Stack gap={1}>
      <Drawer.Title asChild>
        <Heading as="h2" size="xl">
          {media.title}
        </Heading>
      </Drawer.Title>
      <HStack gap={3} color="fg.muted" fontSize="sm" flexWrap="wrap">
        <HStack gap={1}>
          <Calendar size={14} aria-hidden="true" />
          <Text as="span">{displayYear}</Text>
        </HStack>
        <HStack gap={1}>
          <Star
            size={14}
            fill="currentColor"
            color="var(--chakra-colors-yellow-500)"
            aria-hidden="true"
          />
          <Text as="span">{displayRating}</Text>
        </HStack>
        <Text
          as="span"
          textTransform="capitalize"
          borderWidth="1px"
          borderColor="border.default"
          rounded="sm"
          px={1.5}
          py={0.5}
          fontSize="xs"
        >
          {displayMediaType}
        </Text>
      </HStack>
    </Stack>
  );
}

function getDescription(overview: UnifiedMedia["overview"]) {
  return overview || "No description available.";
}

function MediaDescription({ overview }: Pick<UnifiedMedia, "overview">) {
  return (
    <Drawer.Description asChild>
      <Box fontSize="md" lineHeight="relaxed" color="fg.default">
        <div
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(getDescription(overview)),
          }}
        />
      </Box>
    </Drawer.Description>
  );
}

export function SearchMediaSummary({ media }: { media: UnifiedMedia }) {
  return (
    <Stack align="stretch" gap={4} textAlign="left">
      <MediaBackdrop title={media.title} backdrop={media.backdrop} />
      <Flex gap={4} align="flex-start">
        <MediaPoster title={media.title} poster={media.poster} backdrop={media.backdrop} />
        <MediaMetadata media={media} />
      </Flex>
      <MediaDescription overview={media.overview} />
    </Stack>
  );
}
