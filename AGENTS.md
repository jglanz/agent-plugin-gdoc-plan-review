# Google Doc Plan Review

Shared contributor guidance for Claude, Codex, OpenCode, and future harnesses.

Multi-harness plugin: plan approval as a Google Doc review round (sync the plan
into a Doc, answer reviewer comments, custom approval menu). Runtime = one CLI
bundle, `dist/gdoc-review.cjs`, plus `dist/opencode.mjs` for the native OpenCode
plugin. Both artifacts are committed and self-contained.

**Binding companion:** [`STYLE.md`](STYLE.md) — every rule there applies to all
new code.

## Package manager and toolchain

**pnpm** only (`packageManager` pins the version). Node `>=24.9`. Never `npm` or
`yarn`.

```bash
pnpm install
pnpm build        # tsc -b (typecheck + lib/) then esbuild → both dist/ bundles
pnpm lint         # eslint . (the house laws; zero tolerance, no exemption lists)
pnpm test         # build + jest (NODE_OPTIONS=--experimental-vm-modules)
pnpm format       # prettier
pnpm validate     # Claude validator plus Codex and OpenCode package checks
```

`pnpm validate` always checks the Codex and OpenCode package contracts and runs
`claude plugin validate .` when the `claude` binary is on PATH (the Claude check
is skipped when absent, so CI never depends on it). That plain invocation is the
gate: `--strict` is not used, because this contributor file lives at the plugin
root and is not shipped context.

Both `dist/` bundles are committed: after any `src/` change run `pnpm build` and
include regenerated artifacts; CI fails on a stale bundle.

## Layout

- `src/` — TypeScript (CJS output to `lib/cjs`, never imported at runtime; the
  bundle is).
- `tests/` — mirrors `src/` one-to-one; `tests/fixtures/` holds hook payloads
  and a transcript sample; `tests/integration/` spawns the bundle.
- `skills/gdoc-review/` — `SKILL.md` (the `/gdoc-review` command) and `ROUND.md`
  (the review-round protocol rendered into hook deny reasons).
- `hooks/hooks.json` is Claude-only; `hooks/codex.json` is selected by the
  portable manifest OpenAI extension. Never route Codex into Claude mode
  changes.
- `src/host/` contains the harness registry, shared session binding and native
  approval engine, host question protocols, and the OpenCode bridge. Read
  `docs/harness-adapters.md` before adding a harness; do not clone the workflow.
- `src/review/` contains host-independent approval checks.
- `bin/gdoc-review` is the plain-JS launcher.

## Invariants

- **Unit tests are mandatory for every created or modified symbol** — happy path
  plus at least one failure/edge case, in the same change, mirrored under
  `tests/`.
- **stdout is a protocol channel.** Hook and CLI JSON is the only thing written
  to stdout. Diagnostics go through the `tracer` file logger (`src/logging/`);
  `console.*` is banned.
- **No `src/` in any import specifier**; in-package imports carry `.js`; tests
  import the package through its self-alias.
- **No `@wireio/*` packages** and no external Google Workspace account other
  than the one configured for tests (`code/claude/wip/<Doc>` on the personal
  drive).
- **No git commits, pushes, or `gh` calls by agents.** Work stays in the working
  tree until the maintainer reviews it.
- Hook handlers must be pure over `(hook input, state file)`: no network, no MCP
  calls; every decision is unit-testable with a fixture payload.
- Every closed set is an identity string enum; `match()` from `ts-pattern` over
  `switch`.
