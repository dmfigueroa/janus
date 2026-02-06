"use client";

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
} from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Watchlist } from "@/db/schema";
import { createWatchlist } from "@/server/watchlists";
import { useRouter } from "@tanstack/react-router";

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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <WatchlistList
            watchlists={watchlists}
            selectedWatchlistId={selectedWatchlistId}
            onSelect={(id) => {
              onSelect(id);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
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
          <WatchlistList
            watchlists={watchlists}
            selectedWatchlistId={selectedWatchlistId}
            onSelect={(id) => {
              onSelect(id);
              setOpen(false);
            }}
          />
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

  return (
    <Command className="h-auto">
      <CommandInput placeholder="Search watchlists..." onValueChange={setQuery} />
      <CommandList className="max-h-none overflow-visible">
        <ScrollArea className="max-h-[300px]">
          <CommandEmpty>No watchlist found.</CommandEmpty>
          {query && (
            <CommandGroup>
              <CommandItem
                key={`create-${query}`}
                value={`Create "${query}"`}
                onSelect={async () => {
                  const newList = await createWatchlist({ data: { name: query } });
                  await router.invalidate();
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
        </ScrollArea>
      </CommandList>
    </Command>
  );
}
