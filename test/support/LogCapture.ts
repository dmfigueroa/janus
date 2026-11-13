import {
  createServerLogger,
  resetServerLogger,
  setServerLogger,
} from "@/shared/logging/ServerLog.server";

export type CapturedLogRecord = Record<string, unknown>;

/** Route server logs to an array so tests can assert structured fields. */
export function captureServerLogs(): CapturedLogRecord[] {
  const records: CapturedLogRecord[] = [];
  const destination = {
    write(line: string) {
      records.push(JSON.parse(line) as CapturedLogRecord);
    },
  };
  setServerLogger(createServerLogger(destination));
  return records;
}

export function restoreServerLogs() {
  resetServerLogger();
}
