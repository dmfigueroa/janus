import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
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

  const handleSubmit = () => {
    onSearch(value);
  };

  return (
    <div className="flex w-full max-w-lg items-center gap-2">
      <div className="relative flex-1">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <SearchIcon className="size-4" />
        </div>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Search..."
          className="pl-10 h-10 bg-secondary/50 border-transparent focus-visible:ring-primary/20 focus-visible:border-primary/50 transition-all rounded-xl"
        />
      </div>
      <Button onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? (
          <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          "Search"
        )}
      </Button>
    </div>
  );
}
