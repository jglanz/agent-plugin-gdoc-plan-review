import Assert from "node:assert"
import path from "node:path"

import type { CommandModule, Options } from "yargs"

import { CodexSessionStore, getActiveHost, HostKind } from "../../host/index.js"
import { PlanFileLocator, sha256OfText } from "../../plan/index.js"
import { ReviewStateStore, ReviewStatus } from "../../state/index.js"
import {
  FsUtils,
  isNonEmptyString,
  readTextFileOrNull,
  writeFileAtomic
} from "../../utils/index.js"
import type { CliState } from "../CliState.js"
import { createCliStore } from "../CliState.js"
import { printJson, readOptionalPlanFile } from "../commandSupport.js"

/** Complete snapshot input; no transcript or task-list inference. */
export interface SnapshotCommandArguments extends CliState.Arguments {
  /** Session id supplied by the host's SessionStart hook. */
  "session-id": string
  /** Existing plan, or explicit destination when combined with --stdin. */
  plan?: string
  /** Read the entire plan from stdin. */
  stdin?: boolean
}

/** Snapshot command contracts. */
export namespace SnapshotCommand {
  /** CLI subcommand. */
  export const Name = "snapshot"
  /** Maximum snapshot accepted from stdin. */
  export const MaxBytes = 4 * 1_024 * 1_024
  /** CLI option definitions. */
  export const Options: Record<string, Options> = {
    [CodexSessionStore.SessionOption]: {
      type: "string",
      demandOption: true,
      describe: "Session id supplied by the Codex hook"
    },
    plan: {
      type: "string",
      describe: "Existing full Markdown plan, or destination with --stdin"
    },
    stdin: {
      type: "boolean",
      default: false,
      describe: "Read the complete Markdown plan from stdin"
    }
  }
}

async function readSnapshotText(
  input: SnapshotCommandArguments,
  planFile: string
): Promise<string> {
  if (!input.stdin) return readTextFileOrNull(planFile)
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk)
    length += bytes.length
    Assert.ok(
      length <= SnapshotCommand.MaxBytes,
      "Plan snapshot exceeds the input limit"
    )
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString(FsUtils.Encoding)
}

/** Creates or binds a complete Codex plan snapshot without changing host mode. */
export function createSnapshotCommand(): CommandModule<
  CliState.Arguments,
  SnapshotCommandArguments
> {
  return {
    command: SnapshotCommand.Name,
    describe:
      "Bind a complete Codex plan snapshot; requires host authorization for any writes",
    builder: SnapshotCommand.Options,
    handler: async argv => {
      Assert.ok(
        getActiveHost() === HostKind.codex,
        "snapshot requires --host codex"
      )
      const sessionId = ReviewStateStore.assertSafeName(
          argv[CodexSessionStore.SessionOption]
        ),
        explicitPlanFile = readOptionalPlanFile(argv.plan)
      Assert.ok(
        argv.stdin || explicitPlanFile != null,
        "Pass --plan or --stdin for the complete plan"
      )
      const store = await createCliStore(),
        sessions = new CodexSessionStore(store.config.stateDirectory)
      await sessions.withLock(sessionId, async () => {
        const planFile =
            explicitPlanFile ??
            path.join(
              store.config.stateDirectory,
              CodexSessionStore.PlansSubpath,
              `${sessionId}${CodexSessionStore.PlanExtension}`
            ),
          session = await sessions.read(sessionId),
          state = await store.load(PlanFileLocator.planSlug(planFile))
        Assert.ok(
          session == null || session.planFile === planFile,
          "This session already reviews another plan"
        )
        Assert.ok(
          state == null ||
            (state.host === HostKind.codex &&
              state.ownerSessionId === sessionId),
          "This plan is owned by another host or session"
        )
        const text = await readSnapshotText(argv, planFile)
        Assert.ok(
          isNonEmptyString(text) && text.trim().length > 0,
          "Plan snapshot must contain complete nonempty Markdown"
        )
        // Invalidate evidence before replacing content so a failed write cannot approve it.
        await sessions.bind(sessionId, planFile)
        if (state != null)
          await store.save({
            ...state,
            status:
              state.status === ReviewStatus.approved
                ? ReviewStatus.active
                : state.status,
            decision: null,
            lastSync: null,
            approvedAt: null,
            approvedMode: null
          })
        if (argv.stdin) await writeFileAtomic(planFile, text)
        printJson({
          host: HostKind.codex,
          sessionId,
          planFile,
          planSha256: sha256OfText(text)
        })
      })
    }
  }
}
