import { createServerOnlyFn } from "@tanstack/react-start";

export const handleMcpEndpointRequest = createServerOnlyFn((request: Request) =>
  import("./McpEndpoint.server").then(({ handleMcpEndpointRequest: handleRequest }) =>
    handleRequest(request),
  ),
);
