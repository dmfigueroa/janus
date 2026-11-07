type BatchOperationResult = { index: number; success: boolean; code: string; message: string };

/** Write operations can depend on earlier writes. Each operation owns its transaction;
 * this module preserves input order and isolates failures, without promising rollback.
 */
export async function executeWriteBatch<Input, Result extends BatchOperationResult>(
  inputs: readonly Input[],
  operation: (input: Input, index: number) => Result | Promise<Result>,
): Promise<Array<Result | BatchOperationResult>> {
  const results: Array<Result | BatchOperationResult> = [];
  for (const [index, input] of inputs.entries()) {
    try {
      results.push(await operation(input, index));
    } catch {
      // Exceptions may contain provider credentials or other sensitive request data.
      console.error("MCP batch operation failed", { index });
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
