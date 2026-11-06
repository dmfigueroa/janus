import { createFileRoute } from "@tanstack/react-router";
import { getLineupData } from "@/features/lineups/manage/Lineups";
import { WatchNow } from "@/features/lineups/read/WatchNow";
export const Route = createFileRoute("/")({ loader: () => getLineupData(), component: IndexRoute });
function IndexRoute() {
  const data = Route.useLoaderData();
  return <WatchNow lineups={data.lineups} />;
}
