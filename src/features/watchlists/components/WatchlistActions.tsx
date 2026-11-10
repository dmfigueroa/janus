import { IconButton, Menu, Portal } from "@chakra-ui/react";
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
import type { Watchlist } from "@/db/Schema";
import { WatchlistFormDialog } from "./WatchlistFormDialog";

type Props = {
  watchlist: Watchlist;
  onTogglePause: () => void;
  onDelete: () => void;
  interactionDisabled: boolean;
};

export function WatchlistActions({
  watchlist,
  onTogglePause,
  onDelete,
  interactionDisabled,
}: Props) {
  const paused = watchlist.pausedAt !== null;
  const pauseLabel = paused ? "Resume watchlist" : "Pause watchlist";
  const PauseIcon = paused ? Play : Pause;
  return (
    <Menu.Root positioning={{ placement: "bottom-end", gutter: 6 }}>
      <Menu.Trigger asChild>
        <IconButton aria-label="Watchlist actions" variant="ghost" minW="44px" h="44px">
          <MoreHorizontal size={20} />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content
            minW="220px"
            p={2}
            rounded="lg"
            borderWidth="1px"
            shadow="md"
            css={{
              "& [role=menuitem]": { minHeight: "44px", gap: "12px", borderRadius: "sm", px: 3 },
            }}
          >
            <Menu.Item value="pause" disabled={interactionDisabled} onClick={onTogglePause}>
              <PauseIcon size={16} />
              {pauseLabel}
            </Menu.Item>
            <WatchlistFormDialog
              mode="edit"
              watchlist={watchlist}
              trigger={
                <Menu.Item value="edit" disabled={interactionDisabled}>
                  <Pencil size={16} />
                  Edit watchlist
                </Menu.Item>
              }
            />
            <Menu.Separator my={1} />
            <Menu.Item
              value="delete"
              color="fg.error"
              disabled={interactionDisabled}
              onClick={onDelete}
            >
              <Trash2 size={16} />
              Delete watchlist
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
