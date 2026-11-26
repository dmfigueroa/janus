import { createFileRoute } from "@tanstack/react-router";
import { lineupsQueryOptions, useLineupData } from "@/features/lineups/read/useLineupData";
import { ManageLineups } from "@/features/lineups/manage/ManageLineups";

export const Route = createFileRoute("/rotations/")({
  headers: () => ({ "Cache-Control": "private, no-cache" }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ ...lineupsQueryOptions(), revalidateIfStale: true }),
  component: RotationsRoute,
});

function RotationsRoute() {
  const { data } = useLineupData();
  return <ManageLineups data={data} />;
}
