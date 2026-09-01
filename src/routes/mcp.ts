import { createFileRoute } from "@tanstack/react-router";
import { handleMcpEndpointRequest } from "@/app/mcp/McpEndpoint";

export const mcpPostHandler = ({ request }: { request: Request }) =>
  handleMcpEndpointRequest(request);

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      DELETE: ({ request }) => handleMcpEndpointRequest(request),
      GET: ({ request }) => handleMcpEndpointRequest(request),
      POST: mcpPostHandler,
    },
  },
});
