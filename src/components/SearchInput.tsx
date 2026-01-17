import { Input } from "./ui/input";
import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface SearchInputProps {
  onSearch: (query: string) => void;
  defaultValue?: string;
  isLoading?: boolean;
}

export function SearchInput({ onSearch, defaultValue = "", isLoading }: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    const handler = setTimeout(() => {
      onSearch(value);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [value, onSearch]);

  return (
    <div className="relative w-full max-w-lg">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {isLoading ? (
          <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <SearchIcon className="size-4" />
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search for movies or TV shows..."
        className="pl-10 h-10 bg-secondary/50 border-transparent focus-visible:ring-primary/20 focus-visible:border-primary/50 transition-all rounded-xl"
      />
    </div>
  );
}
