import { deleteLineup } from "@/features/lineups/manage/DeleteLineup.server";
import { reorderLineups } from "@/features/lineups/manage/ReorderLineups.server";
import type { LineupAction } from "@/features/lineups/manage/Lineups";
import {
  saveCustomLineup,
  updateLineup,
} from "@/features/lineups/manage/LineupConfiguration.server";
export function executeLineupAction(data: LineupAction) {
  if (data.action === "create") return saveCustomLineup(data);
  if (data.action === "edit") return editCustom(data);
  return applyConfiguration(data);
}
function editCustom(data: Extract<LineupAction, { action: "edit" }>) {
  if (data.reference.kind === "system")
    return { success: false as const, message: "Automatic lineups cannot be edited." };
  return saveCustomLineup({
    id: data.reference.id,
    name: data.name,
    watchlistIds: data.watchlistIds,
  });
}
function applyConfiguration(
  data: Extract<LineupAction, { action: "enable" | "delete" | "reorder" }>,
) {
  if (data.action === "enable") return updateLineup(data.reference, { enabled: data.enabled });
  if (data.action === "delete") return deleteLineup(data.reference);
  return reorderLineups(data.references);
}
