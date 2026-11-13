import { serializeError, serverLogger } from "@/shared/logging/ServerLog.server";

type BatchOperationResult = { index: number; success: boolean; code: string; message: string };

/** Write operations can depend on earlier writes. Each operation owns its transaction;
 * this module preserves input order and isolates failures, without promising rollback.
 */
export async function executeWriteBatch<Input, Result extends BatchOperationResult>(
  inputs: readonly Input[],
  operation: (input: Input, index: number) => Result | Promise<Result>,
  toolName: string,
): Promise<Array<Result | BatchOperationResult>> {
  const results: Array<Result | BatchOperationResult> = [];
  for (const [index, input] of inputs.entries()) {
    const startedAt = performance.now();
    try {
      results.push(await operation(input, index));
    } catch (error) {
      serverLogger("error", "mcp.batch.operation_failed", {
        tool: toolName,
        index,
        operationCount: inputs.length,
        outcome: "internal_error",
        durationMs: Math.round(performance.now() - startedAt),
        error: serializeError(error),
      });
      results.push({
        index,
        success: false,
        code: "internal_error",
        message: "The operation failed unexpectedly. Verify its state before retrying.",
      });
    }
  }
  return results;
}
