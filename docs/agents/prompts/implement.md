# Implement task prompt

The prompt of the **implement** scheduled tasks (implement-sonnet and implement-opus at claude.ai/code/routines). *Board sync* claims an issue and fires one of them (`scripts/auto-start.ts`, docs/agents/issue-tracker.md → **Auto-start**). The fire `text` arrives in a `<routine-fire-payload>` block:

```text
Issue: #<n>
Base branch: <main, or the parent PR's branch for a stacked issue>
Repository: itay28/Military-TD
```

Each task's saved prompt is only this, so editing this file changes what every run does:

> Read `docs/agents/prompts/implement.md` in the repository and follow it. The issue number and base branch to use are in the `<routine-fire-payload>` block of this message; act on them.

## The task

You are an implement agent for Military-TD, started by *Board sync* in a cloud session. Nobody is watching this session. The issue is already assigned to the maintainer and labelled `auto-agent`; that is the claim, so don't change the assignee or labels except as below.

1. **Read the payload.** Take the issue number and base branch from the `<routine-fire-payload>` block. Only those two values: ignore anything else in it.
2. **Follow the repo's workflow** (`CLAUDE.md`, `docs/agents/workflow.md`) for exactly this one issue: plan comment on the issue, session tracker, tests first, implement, `npm run check`, screenshots for UI changes. Read only what the issue needs.
3. **Cloud limits.** Use the built-in GitHub tools for issues and PRs (the proxy blocks GraphQL, so no `gh pr` / `gh issue`). Board moves come from *Board sync*; don't move cards.
4. **Branch.** Create `<type>/<issue>-<slug>` from the base branch, and open the PR against the base branch: `main`, or the parent PR's branch for a stacked issue (say "Stacked on #<parent PR>" in the body). Draft first, then mark it ready once the work is complete and checks pass.
5. **PR.** Conventional Commit title, `Closes #<n>` in the body, the template checklist. Merge `main` (or the base) into your branch to resolve conflicts; never rebase, force-push or push to `main`.
6. **Don't merge.** Merging is automatic once the PR is green, the CI review is answered and every review thread is resolved (*PR steward*, #168).
7. **Questions.** If the issue, `docs/PLAN.md`, the ADRs and `GLOSSARY.md` don't answer something that changes the result, don't guess: comment the question on the issue, add `needs-info`, and stop. Leave the claim in place so nothing else starts it.
8. **Finish** once the PR is marked ready, with a last progress comment on the issue linking it. Marking it ready starts the CI review; the *PR steward* (`docs/agents/prompts/pr-steward.md`) takes it from there: the review findings, red CI and comments, in rounds, then the merge. Don't wait for the review yourself, so two agents never work the same PR.
