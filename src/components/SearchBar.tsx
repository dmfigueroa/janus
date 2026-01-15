import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchBar() {
  return (
    <div className="relative flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-10 bg-card border-none rounded-2xl h-12 text-md placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/50"
          placeholder="Find a list, movie, or show..."
        />
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="bg-card rounded-2xl w-12 h-12 text-muted-foreground hover:text-foreground hover:bg-secondary"
      >
        <SlidersHorizontal className="w-5 h-5" />
      </Button>
    </div>
  );
}
