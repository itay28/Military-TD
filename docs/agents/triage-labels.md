# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

Outside the triage roles, `needs-you` marks a PR the PR steward couldn't finish (stuck after 2 rounds), and `needs-approval` a green PR that changes a critical path and waits for the maintainer's `/approve` (#206, #417). Both, and `needs-info`, push to the maintainer's phone; see **Hand-off** in `docs/agents/issue-tracker.md`. Closing a PR or an issue removes `needs-you` and `needs-approval` from it (*Board sync*).

**Splitting when triaging (#537):** agents start from `main`, never stacked on an open PR, so parallelism comes from splitting. Make the data / contract part (types, `src/data` numbers, a flag the others use) its own small issue first; the parts that use it start from `main` once it merges. Parts that edit the same file are chained with native "blocked by" links, or split by file instead of by faction.
