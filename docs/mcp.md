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

## Anchored insert and move

`add_media_to_watchlists`, `add_custom_items_to_watchlists`, `move_watchlist_items`, and
`move_watchlist_parents` accept the same anchor contract. Each addition or move may include
`insertionPosition: "before" | "after"` (or `position` for the move tools) together with `referenceItemId`, the stable Janus
watchlist item ID returned by `get_watchlist` or `find_watchlist_items`. The new or moved
item lands at the reference's rank and existing items shift to keep the order contiguous.

Constraints:

- `referenceItemId` is required when `insertionPosition` is `"before"` or `"after"`. It must
  not be set for `"beginning"` or `"end"` positions.
- Anchors only work in custom-ordered watchlists. Anchoring against a release-ordered list
  returns `not_custom_mode`. `beginning` and `end` silently ignore their anchor on
  release-ordered lists to preserve prior behavior.
- An unranked reference or a reference that does not belong to the destination watchlist
  returns `invalid_reference` and leaves the destination unchanged.
- Anchoring within the same watchlist via `move_watchlist_items` returns `invalid_reference`
  with a hint to use `reorder_watchlist_items` instead.
- `move_watchlist_parents` lands the first sibling at the anchor and trails the rest
  consecutively in the source's existing customRank order.

## Provider addition outcomes

`add_media_to_watchlists` returns authoritative outcomes for each addition in input order:

| Code                      | Meaning                                                  | `success` | `affectedCount`       |
| ------------------------- | -------------------------------------------------------- | --------- | --------------------- |
| `added`                   | Watchlist items were inserted                            | `true`    | Actual inserted count |
| `duplicate`               | A single requested item was already present              | `true`    | `0`                   |
| `no_new_items`            | A TV show or comic volume expansion inserted nothing     | `true`    | `0`                   |
| `provider_unavailable`    | A provider request or response failed                    | `false`   | `0`                   |
| `provider_not_configured` | Required provider configuration is missing               | `false`   | `0`                   |
| `unsupported`             | The requested media addition is deliberately unavailable | `false`   | `0`                   |
| `internal_error`          | An unexpected defect prevented this addition             | `false`   | `0`                   |

Destination and insertion rejection codes remain unchanged. Expected failures and unexpected
errors affect only their own addition; subsequent additions continue in input order.
Unexpected errors are logged with operation identifiers without exposing provider credentials.
Messages are for display and must not be parsed to determine outcomes or counts.

Compatibility: result fields and inputs remain unchanged. `no_new_items` replaces
`no_new_episodes` for both TV shows and comic volumes. Missing configuration now returns
`provider_not_configured`, and deliberately unavailable anime/manga additions return
`unsupported`, rather than `provider_unavailable`. Consumers branching on these older
code values must accept the replacements.
