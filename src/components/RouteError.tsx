import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { Button, HStack, Stack, Text } from "@chakra-ui/react";

const DEFAULT_ERROR_MESSAGE = "Something went wrong while loading this page.";

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return DEFAULT_ERROR_MESSAGE;
  }

  return error.message.trim() || DEFAULT_ERROR_MESSAGE;
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = getErrorMessage(error);

  const handleRetry = () => {
    reset();
    void router.invalidate();
  };

  return (
    <Stack minH="50vh" align="center" justify="center" gap={4} p={4} textAlign="center">
      <Text
        as="h1"
        fontSize={{ base: "4xl", sm: "6xl" }}
        fontWeight="extrabold"
        letterSpacing="display"
      >
        Something went wrong
      </Text>
      <Text fontSize="lg" color="fg.muted" maxW="md">
        {message}
      </Text>
      <HStack gap={2} mt={4}>
        <Button
          type="button"
          onClick={handleRetry}
          bg="accent.solid"
          color="accent.contrast"
          _hover={{ bg: "accent.solid", color: "accent.contrast", opacity: 0.9 }}
        >
          Try Again
        </Button>
        <Button asChild variant="subtle">
          <Link to="/">Go Home</Link>
        </Button>
      </HStack>
    </Stack>
  );
}
