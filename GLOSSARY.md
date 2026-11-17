# Glossary

Domain terms used across Janus. Each entry names the concept, not the code that
currently implements it.

## Watchlist dialog

The create/edit watchlist form and everything that decides what it shows and what
submitting it means: field validation, values retained after a rejection, the
failure kind, and the outcome a transport later renders. It is independent of the
transport that displayed it; web and MCP each keep their own externally observable
contracts.
