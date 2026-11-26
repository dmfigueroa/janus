import { Search, List as ListIcon, Play, type LucideIcon } from "lucide-react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { HStack, Link as ChakraLink, Stack, Text } from "@chakra-ui/react";

export function BottomNav() {
  return (
    <Stack
      as="nav"
      aria-label="Primary navigation"
      position="fixed"
      insetInline={0}
      bottom={0}
      zIndex={50}
      borderTopWidth="1px"
      borderColor="border.default"
      bg="bg.canvas/90"
      backdropFilter="blur(12px)"
      pb="env(safe-area-inset-bottom)"
    >
      <HStack maxW="md" w="full" mx="auto" px={6} h={16} justify="space-around">
        <BottomNavItem item={{ icon: Play, label: "Watch Now", to: "/" }} />
        <BottomNavItem item={{ icon: ListIcon, label: "My Lists", to: "/watchlists" }} />
        <BottomNavItem item={{ icon: Search, label: "Search", to: "/search" }} />
      </HStack>
    </Stack>
  );
}

function BottomNavItem({ item }: { item: NavItem }) {
  return (
    <ChakraLink asChild color="fg.muted" _currentPage={{ color: "accent.solid" }}>
      <Link
        to={item.to}
        preload="intent"
        activeOptions={{ exact: item.to === "/" }}
        activeProps={{ "aria-current": "page" }}
      >
        <Stack
          align="center"
          justify="center"
          gap={1}
          w={20}
          minH={11}
          py={2}
          rounded="lg"
          _hover={{ color: "fg.default", bg: "bg.subtle" }}
          transition="color 0.3s ease-out, background-color 0.3s ease-out"
        >
          <item.icon size={24} aria-hidden="true" />
          <Text fontSize="xs" fontWeight="medium" letterSpacing="wide">
            {item.label}
          </Text>
        </Stack>
      </Link>
    </ChakraLink>
  );
}

type NavItem = { icon: LucideIcon; label: string; to: NonNullable<LinkProps["to"]> };
