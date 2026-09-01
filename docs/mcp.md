# Janus MCP

Janus exposes its MCP server at `https://<janus-hostname>/mcp` from the same
production service as the web application. It does not introduce a second
identity system or a separate MCP deployment.

## Cloudflare Access setup

The existing hostname-wide Cloudflare Access self-hosted application must
continue to cover the Janus hostname, including `/mcp`.

1. In Cloudflare Zero Trust, open **Access controls → Applications**.
2. Edit the existing self-hosted application that matches the Janus hostname.
3. Confirm its Access policy allows the Janus owner and denies everyone else.
4. In **Advanced settings**, enable **Managed OAuth** and save.
5. If the MCP client requires a fixed redirect URI, add that URI under
   **Allowed redirect URIs**. Keep localhost or loopback clients disabled unless
   they are needed for local development.

Managed OAuth lets non-browser MCP clients complete the Access login flow. The
Access policy remains the authorization decision; Janus does not validate a
second user account or issue application credentials.

For API-driven setup, first read the existing application configuration and
preserve all returned fields when updating it. Enable only
`oauth_configuration.enabled` with the Cloudflare Access Applications API.

## Smoke checks

Replace `https://janus.example.com` with the production hostname.

An unauthenticated request must be challenged by Access before Janus handles
the MCP request:

```bash
curl -i https://janus.example.com/mcp
```

Verify that the response is an Access challenge (normally `401` with a
`WWW-Authenticate` header after Managed OAuth is enabled), rather than a Janus
tool response. Do not treat a successful browser cookie as an MCP client test.

Then connect the MCP endpoint from an RFC 8707-capable MCP client, complete the
Cloudflare Access browser login, and verify that the client can:

1. initialize an MCP session;
2. discover `list_watchlists`; and
3. call `list_watchlists` and receive structured watchlist summaries.

The client should be unable to discover tools until Access authentication has
completed. These checks validate the production boundary; the repository
protocol tests validate the MCP handler and watchlist behavior with an
isolated SQLite database.

Reference: [Cloudflare Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/).
