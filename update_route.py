import sys
import os

path = 'src/routes/watchlists/$watchlistId.tsx'
with open(path, 'r') as f:
    content = f.read()

# Replace displayedItems with allItems in usage
s1 = """  const displayedItems = allItems;

  return (
    <div className="container mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-8 pb-32">
      <WatchlistHeader
        watchlist={latestWatchlist}
        totalItems={totalItems}
        watchedItems={watchedItems}
        showUnwatchedOnly={showUnwatchedOnly}
        onToggleFilter={() => setShowUnwatchedOnly((prev) => !prev)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="mt-8">
        <WatchlistTimeline
          items={displayedItems}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      </div>
    </div>
  );"""

r1 = """  return (
    <div className="container mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-8 pb-32">
      <WatchlistHeader
        watchlist={latestWatchlist}
        totalItems={totalItems}
        watchedItems={watchedItems}
        showUnwatchedOnly={showUnwatchedOnly}
        onToggleFilter={() => setShowUnwatchedOnly((prev) => !prev)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="mt-8">
        <WatchlistTimeline
          items={allItems}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      </div>
    </div>
  );"""

if s1 not in content:
    print('Error: s1 not found')
    print('Content snippet around return:')
    start_idx = content.find('return (')
    if start_idx != -1:
        print(content[start_idx-100:start_idx+500])
    sys.exit(1)

content = content.replace(s1, r1)

with open(path, 'w') as f:
    f.write(content)
