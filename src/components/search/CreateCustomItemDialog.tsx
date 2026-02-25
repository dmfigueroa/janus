"use client";

import { useState } from "react";
import { UnifiedMedia } from "@/routes/_shared/-media";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface CreateCustomItemDialogProps {
  children?: React.ReactNode;
  onCreated: (media: UnifiedMedia) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateCustomItemDialog({
  children,
  onCreated,
  open,
  onOpenChange,
}: CreateCustomItemDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen;

  const [title, setTitle] = useState("");
  const [mediaType, setMediaType] = useState<UnifiedMedia["mediaType"]>("movie");
  const [year, setYear] = useState("");
  const [overview, setOverview] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `custom-${crypto.randomUUID()}`;
    const newMedia: UnifiedMedia = {
      id,
      title,
      mediaType,
      source: "custom",
      poster: null,
      year: year || undefined,
      releaseDate: year || undefined,
      overview: overview || undefined,
    };

    onCreated(newMedia);
    setIsOpen(false);

    // Reset form
    setTitle("");
    setMediaType("movie");
    setYear("");
    setOverview("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Custom Item</DialogTitle>
          <DialogDescription>
            Add an item that couldn't be found in the search results.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. My Favorite obscure movie"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={mediaType}
                onValueChange={(v) => setMediaType(v as UnifiedMedia["mediaType"])}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">Movie</SelectItem>
                  <SelectItem value="tv">TV Show</SelectItem>
                  <SelectItem value="book">Book</SelectItem>
                  <SelectItem value="game">Game</SelectItem>
                  <SelectItem value="comic">Comic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year (Optional)</Label>
              <Input
                id="year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="YYYY"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="overview">Description (Optional)</Label>
            <Textarea
              id="overview"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Brief description..."
            />
          </div>
          <DialogFooter>
            <Button type="submit">Create Item</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
