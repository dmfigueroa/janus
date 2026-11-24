# Issue tracker: GitHub

Issues and specs live in `dmfigueroa/janus` GitHub Issues. Never use WebFetch or curl to access the GitHub API directly — always use the `gh` CLI and pass `--repo dmfigueroa/janus` to issue commands.

## Conventions

- **Create an issue**: `gh issue create --repo dmfigueroa/janus --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view --repo dmfigueroa/janus <number> --json title,body,labels,comments` (or `--comments`).
- **List issues**: `gh issue list --repo dmfigueroa/janus --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment --repo dmfigueroa/janus <number> --body "..."`
- **Apply / remove labels**: `gh issue edit --repo dmfigueroa/janus <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close --repo dmfigueroa/janus <number> --comment "..."`

Fetch full issue details, including parent PRDs and blocking dependencies, before planning implementation.

PRs are not used as a feature-request triage surface (`PRs as a request surface: no`). Because GitHub shares one number space across issues and PRs, resolve an ambiguous `#42` with `gh pr view 42` and fall back to `gh issue view --repo dmfigueroa/janus 42`.

## Triage labels

Use the five default triage labels when triaging or labelling issues:

| Label             | Meaning                                  |
| ----------------- | ---------------------------------------- |
| `needs-triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`      | Waiting on reporter for more information |
| `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human` | Requires human implementation            |
| `wontfix`         | Will not be actioned                     |

## Skill mappings

- **"Publish to the issue tracker"**: Create a GitHub issue with `gh issue create --repo dmfigueroa/janus`.
- **"Fetch the relevant ticket"**: Run `gh issue view --repo dmfigueroa/janus <number> --comments`.
