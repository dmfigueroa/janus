import { IconButton } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";

export function CreateWatchlistFloatingButton() {
  return (
    <WatchlistFormDialog
      mode="create"
      trigger={
        <IconButton
          aria-label="Create watchlist"
          position="fixed"
          bottom={24}
          right={6}
          zIndex={40}
          display={{ base: "inline-flex", md: "none" }}
          w={14}
          h={14}
          rounded="full"
          colorPalette="pink"
          shadow="lg"
        >
          <Plus size={28} />
        </IconButton>
      }
    />
  );
}
