import { Box, RadioGroup, Stack, Text } from "@chakra-ui/react";
import type { InsertionPosition } from "@/features/watchlists/Order";

type PositionPickerProps = {
  value: InsertionPosition;
  onChange: (value: InsertionPosition) => void;
};

const positions: Array<{ value: InsertionPosition; label: string }> = [
  { value: "beginning", label: "Beginning" },
  { value: "end", label: "End" },
  { value: "release-adjacent", label: "Release-adjacent" },
];

export function PositionPicker({ value, onChange }: PositionPickerProps) {
  return (
    <Box rounded="md" borderWidth="1px" borderColor="border.default" bg="bg.subtle" p={4}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Text fontSize="sm" fontWeight="medium">
            Insert position
          </Text>
          <Text fontSize="xs" color="fg.muted">
            Choose where this item should land in the watchlist&apos;s manual sequence.
          </Text>
        </Stack>
        <RadioGroup.Root
          value={value}
          colorPalette="pink"
          onValueChange={({ value: nextValue }) => {
            if (nextValue) onChange(nextValue as InsertionPosition);
          }}
        >
          <Stack gap={2}>
            <PositionOptions />
          </Stack>
        </RadioGroup.Root>
      </Stack>
    </Box>
  );
}

function PositionOptions() {
  return positions.map(PositionOption);
}

function PositionOption({ value, label }: { value: InsertionPosition; label: string }) {
  return (
    <RadioGroup.Item key={value} value={value}>
      <RadioGroup.ItemHiddenInput />
      <RadioGroup.ItemControl borderWidth="2px" />
      <RadioGroup.ItemText>{label}</RadioGroup.ItemText>
    </RadioGroup.Item>
  );
}
