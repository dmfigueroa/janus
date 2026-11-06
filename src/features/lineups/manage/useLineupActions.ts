import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { changeLineup, type LineupAction } from "@/features/lineups/manage/Lineups";

export function useLineupActions() {
  const change = useServerFn(changeLineup);
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(data: LineupAction) {
    setSaving(true);
    setError("");
    try {
      const result = await change({ data });
      if (!result.success) {
        setError(result.message);
        return false;
      }
      await router.invalidate();
      return true;
    } catch {
      setError("Could not save lineup changes. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  return { submit, error, saving };
}
