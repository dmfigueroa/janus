import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/utils/cn";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandDialog,
} from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Watchlist } from "@/db/schema";
import { createWatchlist } from "@/features/watchlists/mutations";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

interface WatchlistSelectorProps {
  watchlists: Watchlist[] | undefined;
  selectedWatchlistId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  className?: string;
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
  const selectedWatchlist = watchlists?.find((list) => list.id.toString() === selectedWatchlistId);

  if (isDesktop) {
    return (
      <>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          {selectedWatchlist ? selectedWatchlist.name : "Select a watchlist..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <WatchlistList
            watchlists={watchlists}
            selectedWatchlistId={selectedWatchlistId}
            onSelect={(id) => {
              onSelect(id);
              setOpen(false);
            }}
          />
        </CommandDialog>
      </>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          {selectedWatchlist ? selectedWatchlist.name : "Select a watchlist..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mt-4 border-t">
          <Command>
            <WatchlistList
              watchlists={watchlists}
              selectedWatchlistId={selectedWatchlistId}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
            />
          </Command>
        </div>
      </DrawerContent>
    </Drawer>
  );
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
