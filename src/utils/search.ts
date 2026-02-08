export function escapeLikeString(input: string): string {
  // Escape backslash first to avoid double escaping, then % and _
  return input.replace(/[\\%_]/g, "\\$&");
}
