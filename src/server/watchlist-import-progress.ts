import { and, desc, eq, sql } from "drizzle-orm";
import { watchlistImportJobs } from "../db/schema";
import { getDb } from "../db/db.server";

export type ImportJobStatus = "queued" | "running" | "completed" | "failed";

export type CreateImportProgressRecordInput = {
  sidequestJobId: number;
  watchlistId: number;
  mediaType: string;
  source: string;
  title: string;
  totalItems: number;
};

export type UpdateImportProgressInput = {
  totalItems?: number;
  processedItems: number;
  insertedItems: number;
  message?: string;
};

export async function createImportProgressRecord(input: CreateImportProgressRecordInput) {
  const db = getDb();
  const [record] = await db
    .insert(watchlistImportJobs)
    .values({
      sidequestJobId: input.sidequestJobId,
      watchlistId: input.watchlistId,
      mediaType: input.mediaType,
      source: input.source,
      title: input.title,
      status: "queued",
      totalItems: input.totalItems,
      processedItems: 0,
      insertedItems: 0,
    })
    .returning();

  return record;
}

export async function setImportProgressRunning(sidequestJobId: number) {
  return await updateImportProgressStatus(sidequestJobId, {
    status: "running",
    startedAt: sql`CURRENT_TIMESTAMP`,
  });
}

export async function setImportProgress(sidequestJobId: number, input: UpdateImportProgressInput) {
  const db = getDb();
  await db
    .update(watchlistImportJobs)
    .set({
      totalItems: input.totalItems,
      processedItems: input.processedItems,
      insertedItems: input.insertedItems,
      message: input.message,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(watchlistImportJobs.sidequestJobId, sidequestJobId));
}

export async function setImportProgressCompleted(sidequestJobId: number, message?: string) {
  return await updateImportProgressStatus(sidequestJobId, {
    status: "completed",
    message,
    completedAt: sql`CURRENT_TIMESTAMP`,
  });
}

export async function setImportProgressFailed(sidequestJobId: number, error: string) {
  return await updateImportProgressStatus(sidequestJobId, {
    status: "failed",
    error,
    completedAt: sql`CURRENT_TIMESTAMP`,
  });
}

export async function getImportProgressByJobId(sidequestJobId: number) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(watchlistImportJobs)
    .where(eq(watchlistImportJobs.sidequestJobId, sidequestJobId))
    .limit(1);

  return job || null;
}

export async function getLatestImportProgressByWatchlistId(watchlistId: number) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(watchlistImportJobs)
    .where(and(eq(watchlistImportJobs.watchlistId, watchlistId)))
    .orderBy(desc(watchlistImportJobs.createdAt))
    .limit(1);

  return job || null;
}

async function updateImportProgressStatus(
  sidequestJobId: number,
  updates: {
    status: ImportJobStatus;
    message?: string;
    error?: string;
    startedAt?: ReturnType<typeof sql>;
    completedAt?: ReturnType<typeof sql>;
  },
) {
  const db = getDb();
  await db
    .update(watchlistImportJobs)
    .set({
      status: updates.status,
      message: updates.message,
      error: updates.error,
      startedAt: updates.startedAt,
      completedAt: updates.completedAt,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(watchlistImportJobs.sidequestJobId, sidequestJobId));
}
