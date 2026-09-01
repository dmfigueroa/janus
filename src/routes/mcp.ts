import { createFileRoute } from "@tanstack/react-router";
import { handleMcpRequest } from "@/integrations/mcp/McpHandler";

export const mcpPostHandler = ({ request }: { request: Request }) => handleMcpRequest(request);

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      DELETE: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      POST: mcpPostHandler,
    },
  },
});
