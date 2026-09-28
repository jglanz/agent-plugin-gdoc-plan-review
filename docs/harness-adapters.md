# Harness adapters

The review engine is shared. A harness adapter is responsible for translating
its host's session, tool, question, and lifecycle events into local review
evidence. It does not implement another document-review workflow.

| Harness          | Entry point                       | Plan binding                           | Approval evidence                                         | Permission handling                                                 |
| ---------------- | --------------------------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Claude           | `hooks/hooks.json` → CLI bundle   | Existing transcript discovery          | `AskUserQuestion` plus existing exit gate                 | Existing Claude behavior                                            |
| Codex            | `hooks/codex.json` → CLI bundle   | Explicit session and complete snapshot | Matched `request_user_input` pre/post events              | Native permissions unchanged; in-Plan writes remain release-blocked |
| OpenCode 1.18.32 | `dist/opencode.mjs` native plugin | Explicit session and complete snapshot | Matched `question` pre/post events and `metadata.answers` | Native permissions unchanged; live Google validation pending        |
| Cursor, Junie    | Future adapters                   | Must be verified for each host         | Must come from a genuine native user interaction          | No assumed Claude/Codex permission semantics                        |

## Contracts and responsibilities

- `HostRegistry` declares storage, plan discovery, instructions, and
  capabilities for every implemented harness. Unknown names fail explicitly. No
  shared code treats every non-Claude host as Codex.
- `ReviewSessionStore` owns binding, pending-question evidence, and exclusive
  session locks. Its directories are selected by the registry. Existing Codex
  `codex-sessions` and `plans` paths are preserved; OpenCode uses independent
  namespaces even when `--state-dir` is shared.
- `NativeReviewProtocol` defines native question recognition, complete question
  matching, rendering, answer decoding, and persisted provenance.
  `NativeReviewMenu` holds shared review meaning; Codex and OpenCode render
  their own wire formats.
- `NativeReviewAdapter` validates plan digest, revision, Doc, server, session,
  call id, answer freshness, and one-time consumption. It invokes the shared
  sync and comment recorders. The native bridge normalizes events before they
  reach this layer.
- `OpenCodePlugin` tracks the actual agent from `chat.params`, maps MCP names
  against configured servers, translates denials into pre-tool exceptions, and
  appends feedback to native tool results. It registers no permission override
  and never calls the SDK to start a turn, answer a question, or change agents.
- Google setup and review procedures remain in the shared skill resources. Host
  instructions select the native adapter and permission boundary.

State schema version 2 retains the existing Claude migration and now accepts the
OpenCode host and decision provenance. Reviews remain owned by one host and, for
explicit bindings, one session. Locks serialize local evidence, not Google
requests; review writes must still be sequential.

## Adding Cursor, Junie, or another harness

1. Pin its actual supported plugin/hook API and inspect native payloads. Verify
   how it provides the active session, complete plan, user questions, MCP
   success/failure, resume, and planning mode. Do not infer an API from a
   product name or a shared field spelling.
2. Add its identity and `HostDefinition`. Declare its real storage and
   capability limits; a descriptor alone is not support. Use explicit bindings
   when the host has no stable complete-plan artifact.
3. Implement the native entry point and, when applicable, one
   `NativeReviewProtocol`. Normalize events into the existing local dispatcher.
   If the host lacks correlated native answer evidence, do not advertise
   approval capture or forge it from text.
4. Package the entry point and host instructions. Keep normal host permission
   and execution controls. No catch-all adapter, automatic permission fallback,
   or speculative Cursor/Junie runtime is installed by this change.
5. Run the shared approval contract suite against the new protocol, plus real
   native payload fixtures and a dependency-free package smoke test. Cover
   stale/changed plans, wrong session/call/Doc/server, cancellation, failed
   writes, replay, resume, and compaction.
6. Record live host and Google acceptance separately from synthetic tests.
   Upgrade capability claims only after verifying the intended workflow.

## OpenCode source contract

The adapter is compiled against `@opencode-ai/plugin` 1.18.32. Sources inspected
at tag `v1.18.32`:

- [Plugin hooks](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/plugin/src/index.ts)
- [Question tool](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/opencode/src/tool/question.ts)
- [Tool dispatch](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/opencode/src/session/tools.ts)
- [MCP catalog](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/opencode/src/mcp/catalog.ts)

The published hook type describes built-in tool output (`output`, `metadata`).
The MCP dispatch source passes the raw MCP result (`content`, `isError`) to the
same after-hook. The bridge handles both shapes and rejects MCP errors. Server
names are sanitized before OpenCode combines them with tool suffixes; the
adapter refuses ambiguous matches.

OpenCode V2 uses a different plugin lifecycle and API. This entry point targets
the stable classic Hooks API, not V2. A V2 bridge can reuse the same engine but
requires its own host-contract verification.
