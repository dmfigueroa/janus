import { createServerOnlyFn } from "@tanstack/react-start";

export const handleMcpRequest = createServerOnlyFn((request: Request) =>
  import("./McpHandler.server").then(({ handleMcpRequest: handleRequest }) =>
    handleRequest(request),
  ),
);
