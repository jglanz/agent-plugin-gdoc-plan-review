import Assert from "node:assert"
import { mkdir, rmdir } from "node:fs/promises"
import path from "node:path"

import { z } from "zod"

import { ReviewStateStore } from "../state/ReviewStateStore.js"
import {
  ensureDirectory,
  FsUtils,
  readTextFileOrNull,
  writeFileAtomic
} from "../utils/index.js"
import { NestedError } from "../errors/index.js"

/** Evidence captured before presenting an approval question. */
export const CodexPendingQuestionSchema = z.object({
  toolUseId: z.string().min(1),
  planSha256: z.string().min(1),
  revision: z.number().int(),
  docId: z.string().min(1),
  serverName: z.string().min(1),
  at: z.string()
})

/** A session binding independent of unstable host transcript formats. */
export const CodexSessionRecordSchema = z.object({
  planFile: z.string().min(1),
  pendingQuestion: CodexPendingQuestionSchema.nullable(),
  lastStopTurnId: z.string().nullable(),
  waitingForUser: z.boolean()
})

/** Persisted Codex session state. */
export interface CodexSessionRecord extends z.infer<
  typeof CodexSessionRecordSchema
> {}

/** Atomic storage for one explicit plan binding per Codex session. */
export class CodexSessionStore {
  /** Creates a store next to the owning review store. */
  constructor(readonly stateDirectory: string) {}

  /** Serializes this session's hooks; contention fails safely instead of losing evidence. */
  async withLock<T>(
    sessionId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockPath = `${this.sessionFile(sessionId)}${CodexSessionStore.LockSuffix}`
    await ensureDirectory(path.dirname(lockPath))
    try {
      await mkdir(lockPath, { mode: FsUtils.DirectoryMode })
    } catch (cause) {
      throw new NestedError(
        "Codex review session is locked; retry after the current operation finishes. After a crash, remove the stale session lock only when no review process is running.",
        { cause, context: { lockPath } }
      )
    }
    try {
      return await operation()
    } finally {
      await rmdir(lockPath)
    }
  }

  /** Resolves a safe session binding path. */
  sessionFile(sessionId: string): string {
    return path.join(
      this.stateDirectory,
      CodexSessionStore.SessionsSubpath,
      ReviewStateStore.assertSafeName(sessionId)
    )
  }

  /** Reads a binding; malformed existing records fail rather than disappear. */
  async read(sessionId: string): Promise<CodexSessionRecord> {
    const text = await readTextFileOrNull(this.sessionFile(sessionId))
    return text == null
      ? null
      : CodexSessionRecordSchema.parse(JSON.parse(text))
  }

  /** Persists a validated binding. */
  async save(sessionId: string, record: CodexSessionRecord): Promise<void> {
    await writeFileAtomic(
      this.sessionFile(sessionId),
      JSON.stringify(
        CodexSessionRecordSchema.parse(record),
        null,
        CodexSessionStore.Indent
      )
    )
  }

  /** Binds a plan without silently replacing another active session binding. */
  async bind(sessionId: string, planFile: string): Promise<void> {
    const previous = await this.read(sessionId)
    Assert.ok(
      previous == null || previous.planFile === planFile,
      "This Codex session is already bound to another plan"
    )
    await this.save(sessionId, {
      planFile,
      pendingQuestion: null,
      lastStopTurnId: null,
      waitingForUser: false
    })
  }
}

/** Storage constants for Codex session bindings and snapshots. */
export namespace CodexSessionStore {
  /** Exclusive directory lock; never automatically stolen from another process. */
  export const LockSuffix = ".lock"
  /** Kept separate even when both hosts receive the same --state-dir. */
  export const SessionsSubpath = "codex-sessions"
  /** Directory for plugin-managed complete plan snapshots. */
  export const PlansSubpath = "plans"
  /** Complete plan snapshot extension. */
  export const PlanExtension = ".md"
  /** Human-readable JSON indentation. */
  export const Indent = 2
  /** Explicit session binding CLI option. */
  export const SessionOption = "session-id"
}
