# Codex release acceptance

Status: **blocked on verified stock-host support for in-Plan review writes**.
The local CLI version inspected during development is 0.157.1. This is not a
claim of Desktop or end-to-end compatibility.

## Evidence collected

- The complete automated suite passes, including the existing Claude tests,
  synthetic Codex hooks, two review revisions, approval replay rejection,
  malformed responses, host/session isolation, and package-contract failures.
- Build, lint, formatting, and `pnpm validate` pass. Claude's validator retains
  its existing warning that root `CLAUDE.md` is contributor guidance rather than
  shipped plugin context.
- A fresh temporary `CODEX_HOME` and local marketplace were used with Codex CLI
  0.157.1. Marketplace registration, plugin installation, and listing succeeded;
  the installed plugin was enabled at version 0.1.0. The installed bundle ran
  `capabilities --host codex` without a dependency install and reported the
  expected release blocker. Temporary installations were removed afterward.
- The plugin-creator compatibility validator rejects the retained Claude
  `disable-model-invocation: true` field. The skill-creator quick validator also
  rejects that field and Claude's `argument-hint`. These generic helpers do
  **not** pass for this shared skill. Those fields preserve Claude's existing
  explicit-invocation behavior; removing them merely to pass a helper would
  change that behavior. Codex also has its own
  `policy.allow_implicit_invocation: false` setting.
- Stock CLI `debug prompt-input` excludes this explicit-only skill from the
  model's automatic skill catalog. In a disposable copy, removing the Claude
  flag alone left it excluded; enabling Codex implicit invocation made it
  appear. This verifies the Codex policy is effective, but does not establish
  explicit skill-picker invocation or live hook delivery. Keep those checks
  pending rather than treating installation as proof of invocation.

## Required live acceptance

Before marking Codex fully supported, record client versions and evidence for:

1. Local marketplace installation selects the portable OpenAI hook override,
   explicitly invokes the skill, and runs the committed bundle with no
   dependency install.
2. The user reviews/trusts the current hook definitions. Missing trust does not
   silently become approval evidence.
3. Stock Desktop and CLI explicitly authorize plan-snapshot and registered-Doc
   review writes in native Plan mode. Plugin prompts and filesystem permissions
   alone are insufficient evidence; do not attempt to override host
   instructions.
4. On the configured test account under `code/claude/wip/<Doc>`, setup reuses
   the same Doc; two full revisions sync; comments are answered before
   resolving; declined comments remain open; the revision log reflects real
   successful writes.
5. The actual request_user_input PreToolUse/PostToolUse payloads reach the
   hooks. Compare them with the synthetic contract fixtures and record any
   differences.
6. Approval is bound to the offered plan and consumed once, remains in Plan
   mode, leaves permissions unchanged, and starts no implementation work.
   Changed plans, stale answers, failed writes, resume, and compaction behave as
   documented.

The automated suite validates shared logic and synthetic host contracts. It must
not be described as a live Google or client smoke test. No Google calls occur in
unit/integration tests. Remove the release blocker only with the evidence above.

Sources: [Codex hooks](https://learn.chatgpt.com/docs/hooks) and
[plugin packaging](https://developers.openai.com/plugins/build/plugins).

## Session lock recovery

Hooks and snapshot replacement serialize per Codex session through a directory
at `<state-dir>/codex-sessions/<session-id>.lock`. Contention fails safely. A
crash can leave that directory behind: verify no review process is using the
session, then remove only that stale lock directory and retry. Never delete the
session binding or review state as a substitute for unlocking it.
