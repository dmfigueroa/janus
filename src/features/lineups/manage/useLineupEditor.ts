import { useState } from "react";
import type { LineupData, LineupAction } from "@/features/lineups/manage/Lineups";
import { useLineupActions } from "@/features/lineups/manage/useLineupActions";
type Lineup = LineupData["lineups"][number];
export function useLineupEditor(lineup: Lineup | undefined, watchlists: LineupData["watchlists"]) {
  const [open, setOpenState] = useState(false);
  const initial = editorValues(lineup);
  const [name, setName] = useState(initial.name);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>(initial.selected);
  const actions = useLineupActions();
  function setOpen(next: boolean) {
    if (next) {
      const values = editorValues(lineup);
      setName(values.name);
      setSelected(values.selected);
      setSearch("");
    }
    setOpenState(next);
  }
  const visible = watchlists.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );
  function toggle(id: number, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  }
  async function save() {
    const data = editorAction(lineup, name, selected);
    if (await actions.submit(data)) setOpen(false);
  }
  return {
    open,
    setOpen,
    name,
    setName,
    search,
    setSearch,
    selected,
    visible,
    toggle,
    save,
    ...actions,
  };
}
function editorValues(lineup: Lineup | undefined) {
  if (!lineup) return { name: "", selected: [] };
  return { name: lineup.name, selected: selectedIds(lineup) };
}
function selectedIds(lineup: Lineup) {
  return lineup.configuredWatchlists?.map((item) => item.id) ?? [];
}
function editorAction(
  lineup: Lineup | undefined,
  name: string,
  watchlistIds: number[],
): LineupAction {
  if (lineup?.reference.kind === "custom")
    return { action: "edit", reference: lineup.reference, name, watchlistIds };
  return { action: "create", name, watchlistIds };
}
