import { createFileRoute } from "@tanstack/react-router";
import { getLineupData } from "@/features/lineups/Lineups";
import { ManageLineups } from "@/features/lineups/ManageLineups";
export const Route = createFileRoute("/rotations/")({
  loader: () => getLineupData(),
  component: RotationsRoute,
});
function RotationsRoute() {
  return <ManageLineups data={Route.useLoaderData()} />;
}
