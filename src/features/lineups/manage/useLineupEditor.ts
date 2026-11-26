import { useEffect, useRef, useState } from "react";
import type { LineupData, LineupAction } from "@/features/lineups/manage/Lineups";
import { useLineupActions } from "@/features/lineups/manage/useLineupActions";
type CustomLineup = Extract<LineupData["lineups"][number], { kind: "custom" }>;
export function useLineupEditor(
  lineup: CustomLineup | undefined,
  watchlists: LineupData["watchlists"],
) {
  const [open, setOpenState] = useState(false);
  const initial = editorValues(lineup);
  const [name, setName] = useState(initial.name);
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [nameError, setNameError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<number[]>(initial.selected);
  const actions = useLineupActions();
  useEffect(() => {
    if (actions.errorField === "name") nameRef.current?.focus();
  }, [actions.errorField]);
  function setOpen(next: boolean) {
    if (actions.saving) return;
    if (next) {
      const values = editorValues(lineup);
      setName(values.name);
      setSelected(values.selected);
      setSearch("");
      setSelectedOnly(false);
      setNameError("");
      actions.clearError();
    }
    setOpenState(next);
  }
  const visible = watchlists.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) &&
      (!selectedOnly || selected.includes(item.id)),
  );
  function toggle(id: number, checked: boolean) {
    setSelected((current) => updateSelectedIds(current, id, checked));
  }
  function changeName(value: string) {
    setName(value);
    setNameError("");
    actions.clearError();
  }
  async function save() {
    if (!name.trim()) {
      setNameError("Enter a name for this lineup.");
      focusName();
      return;
    }
    setNameError("");
    const data = editorAction(lineup, name, selected);
    if (await actions.submit(data)) setOpen(false);
  }
  function focusName() {
    nameRef.current?.focus();
  }
  return {
    open,
    setOpen,
    name,
    setName: changeName,
    search,
    setSearch,
    selectedOnly,
    setSelectedOnly,
    nameRef,
    nameError: nameError || (actions.errorField === "name" ? actions.error : ""),
    selected,
    visible,
    toggle,
    save,
    ...actions,
  };
}
function updateSelectedIds(current: number[], id: number, checked: boolean) {
  if (!checked) return current.filter((value) => value !== id);
  return current.includes(id) ? current : [...current, id];
}
function editorValues(lineup: CustomLineup | undefined) {
  if (!lineup) return { name: "", selected: [] };
  return { name: lineup.name, selected: selectedIds(lineup) };
}
function selectedIds(lineup: CustomLineup) {
  return Array.from(new Set(lineup.configuredWatchlists.map((item) => item.id)));
}
function editorAction(
  lineup: CustomLineup | undefined,
  name: string,
  watchlistIds: number[],
): LineupAction {
  if (lineup) return { action: "edit", reference: lineup.reference, name, watchlistIds };
  return { action: "create", name, watchlistIds };
}
