import { Box, Image } from "@chakra-ui/react";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { buildMediaPosterUrl } from "@/utils/Tmdb";

export function WatchlistCardCover({ watchlist }: { watchlist: WatchlistSummary }) {
  const { stats } = watchlist;
  if (!stats.coverImage) {
    return (
      <Box
        position="absolute"
        inset={0}
        bgGradient="to-br"
        gradientFrom="gray.800"
        gradientTo="gray.900"
      />
    );
  }

  const coverImageUrl = buildMediaPosterUrl(stats.coverImage, "w500");
  if (stats.coverMediaType !== "episode") {
    return (
      <Image
        src={coverImageUrl}
        alt={watchlist.name}
        position="absolute"
        inset={0}
        w="full"
        h="full"
        objectFit="cover"
        transition="transform 500ms"
        _groupHover={{ transform: "scale(1.05)" }}
      />
    );
  }

  return (
    <Box
      position="absolute"
      inset={0}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="gray.900"
      overflow="hidden"
    >
      <Image
        src={coverImageUrl}
        alt=""
        position="absolute"
        inset={0}
        w="full"
        h="full"
        objectFit="cover"
        filter="blur(24px)"
        transform="scale(1.5)"
        opacity={0.8}
      />
      <Box position="relative" zIndex={10} w="full" aspectRatio="16 / 9" shadow="2xl">
        <Image
          src={coverImageUrl}
          alt={watchlist.name}
          w="full"
          h="full"
          objectFit="cover"
          rounded="sm"
          shadow="0 10px 15px -3px rgb(0 0 0 / 0.5)"
        />
      </Box>
    </Box>
  );
}
