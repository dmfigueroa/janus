import { SearchInput } from "@/components/SearchInput";
import { SearchResults } from "@/features/search/SearchResults";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "@/server/Media";
import type { UnifiedMedia } from "@/server/Media";
import { useSearchResults } from "./useSearchResults";
import { useSearchNavigation } from "./useSearchNavigation";

interface SearchScreenProps {
  query: string;
  type: UnifiedMedia["mediaType"];
  initialData: {
    results: UnifiedMedia[];
    page: number;
    total_pages: number;
    total_results: number;
    rejected?: boolean;
    message?: string;
  };
}

function getActiveTab(type: UnifiedMedia["mediaType"]) {
  if (isDeprecatedMediaType(type)) return "movie";
  return type;
}

function DeprecatedSearchNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="mx-auto mt-8 max-w-3xl rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
      {DEPRECATED_MEDIA_MESSAGE} Please switch to Movies, TV, Games, Books, or Comics.
    </div>
  );
}

export function SearchScreen({ query, type, initialData }: SearchScreenProps) {
  const { allResults, fetchNextPage, hasNextPage, isFetchingNextPage } = useSearchResults({
    query,
    type,
    initialData,
  });
  const { handleSearch, handleTabChange } = useSearchNavigation(query, type);
  const isDeprecated = isDeprecatedMediaType(type);
  const activeTab = getActiveTab(type);

  return (
    <div className="container mx-auto min-h-screen px-4 py-8 md:px-8 pb-24">
      <div className="mb-8 flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          <span className="text-primary">Discover</span>{" "}
          <span className="text-muted-foreground">Everything</span>
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          Find movies, shows, games, books, and comics.
        </p>
        <p className="max-w-xl rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-700">
          {DEPRECATED_MEDIA_MESSAGE}
        </p>

        <SearchInput onSearch={handleSearch} defaultValue={query} isLoading={false} />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full max-w-3xl">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="movie">Movies</TabsTrigger>
            <TabsTrigger value="tv">TV</TabsTrigger>
            <TabsTrigger value="game">Games</TabsTrigger>
            <TabsTrigger value="book">Books</TabsTrigger>
            <TabsTrigger value="comic">Comics</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <DeprecatedSearchNotice visible={isDeprecated && Boolean(query)} />

      <div className="mt-8">
        <SearchResults
          results={allResults}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </div>
    </div>
  );
}
