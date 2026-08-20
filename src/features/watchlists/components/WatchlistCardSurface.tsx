import { Box, Button } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

type WatchlistCardSurfaceProps = {
  children: ReactNode;
  selectionMode: boolean;
  isSelected: boolean;
  watchlistName: string;
  onToggle?: () => void;
};

export function WatchlistCardSurface({
  children,
  selectionMode,
  isSelected,
  watchlistName,
  onToggle,
}: WatchlistCardSurfaceProps) {
  const surfaceStyles = getSurfaceStyles(selectionMode, isSelected);

  if (selectionMode) {
    return (
      <Button
        type="button"
        variant="plain"
        aria-label={`Select ${watchlistName}`}
        {...surfaceStyles}
        display="block"
        w="full"
        h="auto"
        p={0}
        textAlign="left"
        onClick={onToggle}
      >
        {children}
        <SelectionIndicator isSelected={isSelected} />
      </Button>
    );
  }

  return <Box {...surfaceStyles}>{children}</Box>;
}

function getSurfaceStyles(selectionMode: boolean, isSelected: boolean) {
  return {
    position: "relative" as const,
    aspectRatio: "2 / 3",
    overflow: "hidden" as const,
    rounded: "card",
    shadow: "2xl",
    transition: "transform 300ms, box-shadow 300ms",
    ...getSelectionSurfaceStyles(selectionMode),
    ...getSelectedSurfaceStyles(isSelected),
  };
}

function getSelectionSurfaceStyles(selectionMode: boolean) {
  return selectionMode
    ? { transform: "scale(0.98)" }
    : { _groupHover: { transform: "scale(1.02)" } };
}

function getSelectedSurfaceStyles(isSelected: boolean) {
  return isSelected ? { outline: "4px solid", outlineColor: "accent.solid" } : {};
}

function SelectionIndicator({ isSelected }: { isSelected: boolean }) {
  return (
    <Box position="absolute" top={3} right={3} zIndex={30}>
      <Box
        h={6}
        w={6}
        rounded="full"
        borderWidth="2px"
        borderColor="white"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg={isSelected ? "accent.solid" : "blackAlpha.600"}
        transition="background 150ms"
      >
        {isSelected ? <Check size={16} color="white" /> : null}
      </Box>
    </Box>
  );
}
