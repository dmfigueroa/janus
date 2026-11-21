import { Flex } from "@chakra-ui/react";

export function TimelineYearHeading({ year }: { year: string }) {
  return (
    <Flex bg="bg.canvas" py={2} align="center">
      <Flex
        h={8}
        position="relative"
        align="center"
        rounded="full"
        bg="bg.canvas"
        px={4}
        fontSize="xs"
        fontWeight="bold"
        color="fg.default"
        borderWidth="1px"
        borderColor="border.default"
        ml={{ base: 0, md: 4 }}
      >
        {year}
      </Flex>
    </Flex>
  );
}
