# OpenCode validation

The implementation targets the classic Hooks API in OpenCode **1.18.32**.
`@opencode-ai/plugin` is pinned to that version as a development dependency; the
shipped ESM bundle includes its runtime dependencies. It exports only the plugin
entry point, `GDocReviewOpenCode`.

## Verified locally

- TypeScript compilation and both bundle builds pass.
- Lint, formatting, and Claude/Codex/OpenCode package validation pass. Claude's
  validator retains its existing warning about root `CLAUDE.md` being
  contributor context rather than shipped skill context.
- The shared contract suite runs for Codex and OpenCode, including native
  approval, stale or changed plans, wrong session/call, expiry, replay,
  cancellation, explicit bindings, and unchanged native permissions.
- OpenCode bridge tests exercise its native `metadata.answers` shape, raw MCP
  results, configured-server matching, failed writes, resume, compaction,
  session deletion, and preservation of existing user commands.
- Process tests run snapshot, initialization, registration, two review
  revisions, comment recording, approval, and replay rejection for both native
  adapters. These use normalized fixture events; they do not claim a live
  model/Google run.
- `pnpm validate:opencode` copies only `dist/` and `skills/` to a temporary
  directory outside this repository, imports the plugin without `node_modules`,
  checks the native hook exports and command, and executes the read-only context
  tool with an isolated state directory. Missing package resources fail
  validation.
- Stock `pnpm dlx opencode-ai@1.18.32 debug config`, run in a temporary
  workspace with separate XDG config/data/state/cache directories and a file-URL
  plugin entry, loaded the ESM bundle and registered `/gdoc-review` with the
  `plan` agent and the correct installed instructions path. Automatic updates
  and model fetching were disabled. The temporary configuration was removed
  afterwards.

## Remaining live acceptance

No Google document or user-installed OpenCode configuration was changed during
this implementation. `inPlanWritesVerified` remains `false`, with
`live_review_validation_pending`, until a real review proves the following:

1. The native `plan` agent permits the required snapshot and Docs/Drive
   operations through normal host permissions. A host denial keeps the review
   pending.
2. A configured workspace-mcp server synchronizes a complete plan and returns
   the expected successful tool result to the native plugin.
3. Reviewer feedback produces a second revision, replies precede resolution, and
   the revision log is updated.
4. The native question UI returns genuine answer metadata and records approval
   for the offered revision exactly once, including after resume or compaction.
5. Review approval leaves native agent, permissions, and execution controls
   unchanged.

OpenCode V2, Cursor, and Junie have no implemented native bridge in this change.
See [the adapter contracts](harness-adapters.md) before adding another harness.
Codex retains its separate
[in-Plan write release prerequisite](codex-validation.md).
