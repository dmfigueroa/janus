import { parseDate, type CalendarDate } from "@internationalized/date";
import { useMemo, useSyncExternalStore } from "react";

function formatLocalTodayIso(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getServerTodayIso(): null {
  return null;
}

function millisecondsUntilNextMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1000, nextMidnight.getTime() - now.getTime() + 100);
}

function subscribeToMidnight(onDateChange: () => void) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const scheduleNextMidnight = () => {
    timeoutId = setTimeout(() => {
      onDateChange();
      scheduleNextMidnight();
    }, millisecondsUntilNextMidnight());
  };

  scheduleNextMidnight();
  return () => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  };
}

export function useTodayCivilDate(): CalendarDate | undefined {
  const todayIso = useSyncExternalStore(
    subscribeToMidnight,
    formatLocalTodayIso,
    getServerTodayIso,
  );
  return useMemo(() => (todayIso ? parseDate(todayIso) : undefined), [todayIso]);
}
