import { createFileRoute } from "@tanstack/react-router";
import { lineupsQueryOptions, useLineupData } from "@/features/lineups/read/useLineupData";
import { WatchNow } from "@/features/lineups/read/WatchNow";

export const Route = createFileRoute("/")({
  headers: () => ({ "Cache-Control": "private, no-cache" }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ ...lineupsQueryOptions(), revalidateIfStale: true }),
  component: IndexRoute,
});

function IndexRoute() {
  const { data } = useLineupData();
  return <WatchNow lineups={data.lineups} />;
}
