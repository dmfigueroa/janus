import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { invalidateLineupQueries } from "@/features/lineups/Cache";
import { changeLineup, type LineupAction } from "@/features/lineups/manage/Lineups";

export function useLineupActions() {
  const change = useServerFn(changeLineup);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(data: LineupAction) {
    setSaving(true);
    setError("");
    setErrorField("");
    try {
      const result = await change({ data });
      if (!result.success) {
        setError(result.message);
        setErrorField(resultField(result));
        return false;
      }
      await invalidateLineupQueries(queryClient);
      await router.invalidate();
      return true;
    } catch {
      setError("Could not save lineup changes. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  function clearError() {
    setError("");
    setErrorField("");
  }
  return { submit, error, errorField, saving, clearError };
}
function resultField(result: object) {
  if ("field" in result && typeof result.field === "string") return result.field;
  return "";
}
