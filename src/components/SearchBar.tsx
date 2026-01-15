import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchBar() {
  return (
    <div className="relative flex items-center gap-3">
        <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input 
                className="pl-10 bg-[#1F1C25] border-none rounded-2xl h-12 text-md placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-primary/50" 
                placeholder="Find a list, movie, or show..." 
            />
        </div>
        <Button size="icon" variant="ghost" className="bg-[#1F1C25] rounded-2xl w-12 h-12 text-zinc-400 hover:text-white hover:bg-[#2A2631]">
            <SlidersHorizontal className="w-5 h-5" />
        </Button>
    </div>
  );
}
