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

## Functional programming conformance

This repository carries an FP conformance ratchet. Before you land a change:

```sh
python3 tools/fp-conformance/fp_conformance.py .
```

CI compares your findings against `tools/fp-conformance/budget.json` and fails
only when a rule's count *increases*. Do not raise the budget to get green — fix
the new violations. When you clear a class of violation, lower the budget in the
same commit with `--write-budget`.

The principles, the rule codes and the remedy for each are in `FP-GUIDELINES.md`.
