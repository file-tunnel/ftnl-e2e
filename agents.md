# File Tunnel end-to-end agent instructions

These instructions apply to this repository and every directory beneath it.

## Repository role

- This repository owns cross-driver browser conformance for the complete File
  Tunnel handoff.
- Keep Playwright, Puppeteer, and Selenium scenarios behaviorally aligned and
  put shared product behavior in `tests/browser/support`.
- Preserve tests for fragment-only pairing, capability separation, one-time
  event tickets, byte integrity, progress ordering, cancellation, privacy
  headers, and safe failure behavior.
- Use only isolated, short-retention environments for external runs. Redact
  fragments, capabilities, filenames, and user content from traces, logs,
  screenshots, and retained artifacts.

## Validation

- Run `nix develop --command agent-check` before completing a change.
- Run the affected real-browser suite when browser behavior changes.
- Never commit downloaded browsers, test artifacts, credentials, or production
  endpoint secrets.

## Git workflow

- Keep changes focused and reviewable.
- Pull and merge remote work before pushing; avoid git rebase in favor of git merge.
- Never discard unrelated or uncommitted user work.

## Repository-local Git worktrees

- Create or use a Git worktree only when the human operator explicitly authorizes it for the current task. Concurrency or a dirty checkout is not permission by itself.
- Put every authorized worktree at `<repository-root>/tmp/worktrees/<name>`; from the repository root, use `./tmp/worktrees/<name>`. Never place worktrees beside repositories or organization directories.
- Keep `tmp`, `temp`, `tmp/worktrees`, and `temp/worktrees` ignored in the repository-root `.gitignore`. Do not commit files from those directories.
- Relocate or remove a worktree only when the operator explicitly requests it. Before removal, preserve and publish intended changes, verify its commit is represented on the target branch, and confirm there are no tracked, untracked, ignored-sensitive, or in-use files that must survive. Remove it with `git worktree remove <path>` without `--force`; never delete a worktree directory with `rm`.
