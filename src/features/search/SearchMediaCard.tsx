import { Box, Image, Stack, Text } from "@chakra-ui/react";
import type { UnifiedMedia } from "@/server/Media";
import { Star } from "lucide-react";

interface SearchMediaCardProperties {
  media: UnifiedMedia;
  onClick: () => void;
}

const missingPosterUrl = "https://placehold.co/500x750/1a1a1a/666?text=No+Poster";

function getPosterUrl(poster: string | null | undefined) {
  return poster || missingPosterUrl;
}

function HighRatingStar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <Star size={12} fill="currentColor" aria-hidden="true" />;
}

function MediaRating({ rating }: { rating: number | null | undefined }) {
  if (!rating) return null;
  const isHighRating = rating >= 7.5;
  const ratingLabel = rating.toFixed(1);

  return (
    <Box
      position="absolute"
      top={2}
      right={2}
      display="flex"
      alignItems="center"
      gap={1}
      rounded="sm"
      bg={isHighRating ? "accent.solid" : "blackAlpha.600"}
      color="white"
      px={1.5}
      py={0.5}
      fontSize="xs"
      fontWeight="bold"
      shadow="sm"
      backdropFilter="blur(12px)"
    >
      <HighRatingStar visible={isHighRating} />
      <Text as="span">{ratingLabel}</Text>
    </Box>
  );
}

function MediaArtwork({ media }: { media: UnifiedMedia }) {
  return (
    <Box
      position="relative"
      aspectRatio="2 / 3"
      overflow="hidden"
      rounded="card"
      bg="bg.subtle"
      borderWidth="1px"
      borderColor="border.default"
      shadow="sm"
      transition="all 300ms"
    >
      <Image
        src={getPosterUrl(media.poster)}
        alt={media.title}
        h="full"
        w="full"
        objectFit="cover"
        transition="transform 500ms"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <Box
        position="absolute"
        inset={0}
        bgGradient="to-t"
        gradientFrom="blackAlpha.800"
        gradientTo="transparent"
        opacity={0.6}
      />
      <MediaRating rating={media.rating} />
    </Box>
  );
}

function Authors({ authors }: { authors: string[] | undefined }) {
  if (!authors || authors.length === 0) return null;
  const authorLabel = authors.join(", ");

  return (
    <Text truncate fontSize="xs" color="fg.muted">
      {authorLabel}
    </Text>
  );
}

function BookAuthors({ media }: { media: UnifiedMedia }) {
  if (media.mediaType !== "book") return null;
  return <Authors authors={media.authors} />;
}

function MediaDetails({ media }: { media: UnifiedMedia }) {
  return (
    <Stack gap={0.5} px={1} textAlign="left">
      <Text
        as="span"
        role="heading"
        aria-level={3}
        truncate
        fontSize="sm"
        fontWeight="medium"
        color="fg.default"
        transition="color 150ms"
      >
        {media.title}
      </Text>
      <BookAuthors media={media} />
      <Text fontSize="xs" color="fg.muted">
        {media.year}
      </Text>
    </Stack>
  );
}

export function SearchMediaCard({ media, onClick }: SearchMediaCardProperties) {
  return (
    <Box
      as="button"
      onClick={onClick}
      display="flex"
      position="relative"
      flexDir="column"
      alignItems="stretch"
      gap={2}
      w="full"
      p={0}
      textAlign="left"
      cursor="pointer"
      transition="transform 300ms"
      _hover={{ transform: "scale(1.02)" }}
      _focusVisible={{ outline: "3px solid", outlineColor: "accent.solid", outlineOffset: 3 }}
    >
      <MediaArtwork media={media} />
      <MediaDetails media={media} />
    </Box>
  );
}
