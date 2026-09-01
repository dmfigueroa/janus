export function asMcpContent<T extends object>(content: T) {
  return {
    structuredContent: content as Record<string, unknown>,
    content: [{ type: "text" as const, text: JSON.stringify(content) }],
  };
}

export function asMcpError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
