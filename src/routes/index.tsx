import { createFileRoute } from "@tanstack/react-router";
import { getWatchlistHomeData } from "@/features/watchlists/home/query";
import { WatchlistsHomeScreen } from "@/features/watchlists/home/screen";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  loader: async () => await getWatchlistHomeData(),
});

function IndexRoute() {
  const home = Route.useLoaderData();

  return <WatchlistsHomeScreen initialData={home} />;
}
