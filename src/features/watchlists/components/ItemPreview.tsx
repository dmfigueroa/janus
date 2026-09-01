import { Box, Center, Flex, Image as ChakraImage, Text } from "@chakra-ui/react";
import { Image } from "lucide-react";
import type { WatchlistItem } from "@/db/Schema";
import { buildMediaPosterUrl } from "@/utils/Tmdb";

type ItemPreviewProps = {
  item: WatchlistItem;
};

export function ItemPreview({ item }: ItemPreviewProps) {
  return (
    <Flex align="center" gap={3} rounded="lg" borderWidth="1px" borderColor="border.default" p={3}>
      {item.posterPath ? (
        <ChakraImage
          src={buildMediaPosterUrl(item.posterPath, "w92")}
          alt=""
          h={12}
          w={8}
          rounded="sm"
          objectFit="cover"
          flexShrink={0}
        />
      ) : (
        <Center h={12} w={8} flexShrink={0} rounded="sm" bg="bg.subtle" color="fg.muted">
          <Image size={16} aria-hidden="true" />
        </Center>
      )}
      <Box minW={0}>
        <Text truncate fontSize="sm" fontWeight="medium">
          {item.title}
        </Text>
        <Text fontSize="xs" color="fg.muted" textTransform="capitalize">
          {item.mediaType}
        </Text>
      </Box>
    </Flex>
  );
}
