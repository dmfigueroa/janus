import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/utils/Cn";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/Button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandDialog,
} from "@/components/ui/Command";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/Drawer";
import { Watchlist } from "@/db/Schema";
import { createWatchlist } from "@/features/watchlists/create/Mutation";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

interface WatchlistSelectorProps {
  watchlists: Watchlist[] | undefined;
  selectedWatchlistId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

interface SelectorContentProps extends WatchlistSelectorProps {
  open: boolean;
  selectedWatchlistName: string | undefined;
  onOpenChange: (open: boolean) => void;
}

function getSelectedWatchlistName(watchlists: Watchlist[] | undefined, selectedId: string) {
  if (!watchlists) return undefined;
  return watchlists.find((list) => list.id.toString() === selectedId)?.name;
}

function SelectorButton({
  open,
  selectedWatchlistName,
  className,
  disabled,
  onClick,
}: Pick<SelectorContentProps, "open" | "selectedWatchlistName" | "className" | "disabled"> & {
  onClick?: () => void;
}) {
  return (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn("w-full justify-between", className)}
      disabled={disabled}
      onClick={onClick}
    >
      {selectedWatchlistName || "Select a watchlist..."}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );
}

function DesktopSelector(props: SelectorContentProps) {
  return (
    <>
      <SelectorButton {...props} onClick={() => props.onOpenChange(true)} />
      <CommandDialog open={props.open} onOpenChange={props.onOpenChange}>
        <WatchlistList
          watchlists={props.watchlists}
          selectedWatchlistId={props.selectedWatchlistId}
          onSelect={props.onSelect}
        />
      </CommandDialog>
    </>
  );
}

function MobileSelector(props: SelectorContentProps) {
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerTrigger asChild>
        <SelectorButton {...props} />
      </DrawerTrigger>
      <DrawerContent>
        <div className="mt-4 border-t">
          <Command>
            <WatchlistList
              watchlists={props.watchlists}
              selectedWatchlistId={props.selectedWatchlistId}
              onSelect={props.onSelect}
            />
          </Command>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function WatchlistSelector({
  watchlists,
  selectedWatchlistId,
  onSelect,
  disabled,
  className,
}: WatchlistSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const selectedWatchlistName = getSelectedWatchlistName(watchlists, selectedWatchlistId);
  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
  };
  const selectorProps = {
    watchlists,
    selectedWatchlistId,
    onSelect: handleSelect,
    disabled,
    className,
    open,
    selectedWatchlistName,
    onOpenChange: setOpen,
  };

  if (isDesktop) {
    return <DesktopSelector {...selectorProps} />;
  }
  return <MobileSelector {...selectorProps} />;
}

function WatchlistList({
  watchlists,
  selectedWatchlistId,
  onSelect,
}: {
  watchlists: Watchlist[] | undefined;
  selectedWatchlistId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const createWatchlistFn = useServerFn(createWatchlist);

  return (
    <>
      <CommandInput placeholder="Search watchlists..." onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No watchlist found.</CommandEmpty>
        {query && (
          <CommandGroup>
            <CommandItem
              key={`create-${query}`}
              value={`Create "${query}"`}
              onSelect={async () => {
                const newList = await createWatchlistFn({ data: { name: query } });
                await router.invalidate?.();
                onSelect(newList.id.toString());
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create "{query}"
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Existing Watchlists">
          {watchlists?.map((list) => (
            <CommandItem
              key={list.id}
              value={list.name}
              onSelect={() => {
                onSelect(list.id.toString() === selectedWatchlistId ? "" : list.id.toString());
              }}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  selectedWatchlistId === list.id.toString() ? "opacity-100" : "opacity-0",
                )}
              />
              {list.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );
}
