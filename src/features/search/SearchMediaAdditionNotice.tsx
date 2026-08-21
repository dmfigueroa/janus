import { HStack, Text } from "@chakra-ui/react";
import { Info } from "lucide-react";
import type { UnifiedMedia } from "@/server/Media";

interface SearchMediaAdditionNoticeProps {
  mediaType: UnifiedMedia["mediaType"];
}

const additionNoticeByMediaType: Partial<
  Record<UnifiedMedia["mediaType"], { mediaLabel: string; itemLabel: string }>
> = {
  tv: { mediaLabel: "a TV show", itemLabel: "episodes" },
  anime: { mediaLabel: "an anime", itemLabel: "episodes" },
  comic: { mediaLabel: "a comic", itemLabel: "issues/volumes" },
  manga: { mediaLabel: "a manga", itemLabel: "issues/volumes" },
};

export function SearchMediaAdditionNotice({ mediaType }: SearchMediaAdditionNoticeProps) {
  const notice = additionNoticeByMediaType[mediaType];
  if (!notice) return null;

  return (
    <HStack
      align="flex-start"
      gap={2}
      rounded="md"
      bg="bg.subtle"
      p={3}
      color="fg.muted"
      fontSize="xs"
    >
      <Info size={16} aria-hidden="true" />
      <Text>
        Adding {notice.mediaLabel} will automatically add{" "}
        <strong>all available {notice.itemLabel}</strong> to your watchlist. This allows you to
        track your progress step by step.
      </Text>
    </HStack>
  );
}
