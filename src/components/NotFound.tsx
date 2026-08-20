import { Link } from "@tanstack/react-router";
import { Button, HStack, Stack, Text } from "@chakra-ui/react";

export function NotFound() {
  return (
    <Stack minH="50vh" align="center" justify="center" gap={4} p={4} textAlign="center">
      <Text
        as="h1"
        fontSize={{ base: "4xl", sm: "6xl" }}
        fontWeight="extrabold"
        letterSpacing="display"
      >
        404
      </Text>
      <Text fontSize="lg" color="fg.muted">
        Oops! The page you're looking for differs from reality.
      </Text>
      <HStack gap={2} mt={4}>
        <Button asChild colorPalette="pink">
          <Link to="/">Go Home</Link>
        </Button>
        <Button asChild variant="subtle">
          <Link to="..">Go Back</Link>
        </Button>
      </HStack>
    </Stack>
  );
}
