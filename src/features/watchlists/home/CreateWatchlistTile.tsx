import { Button, Box, Text } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";

export function CreateWatchlistTile() {
  return (
    <Box w="full" maxW={{ md: "220px" }}>
      <Box display="flex" h="full" flexDirection="column" gap={2}>
        <WatchlistFormDialog
          mode="create"
          trigger={
            <Button
              type="button"
              variant="outline"
              w="full"
              aspectRatio="2 / 3"
              flexDirection="column"
              justifyContent="center"
              gap={2}
              rounded="card"
              borderWidth="2px"
              borderStyle="dashed"
              color="fg.muted"
              _hover={{ borderColor: "fg.muted", bg: "bg.subtle", color: "fg.default" }}
            >
              <Box
                display="flex"
                h={12}
                w={12}
                alignItems="center"
                justifyContent="center"
                rounded="full"
                bg="bg.subtle"
                _groupHover={{ bg: "accent.solid" }}
              >
                <Plus size={24} />
              </Box>
              <Text fontWeight="medium">Create New List</Text>
            </Button>
          }
        />
        <Box px={1} opacity={0}>
          .
        </Box>
      </Box>
    </Box>
  );
}
