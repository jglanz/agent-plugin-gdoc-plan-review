import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  NativeReviewLabel,
  getNativeReviewProtocol,
  FsUtils,
  HookEventName,
  HostKind,
  PreToolUseHookInput,
  MenuCommand,
  PermissionDecision,
  ReviewStatus,
  SnapshotCommand
} from "claude-gdoc-review-plugin"

import {
  createNativeAnswer,
  NativeTest
} from "../support/nativeReviewTestSupport.js"
import { readHookFixture } from "../support/hookTestSupport.js"
import {
  BundleTestEnvironment,
  createBundleTestEnvironment,
  destroyBundleTestEnvironment,
  PluginRootPath,
  ProcessDocId,
  ProcessDocUrl,
  ProcessFolderId,
  ProcessPlanText,
  ProcessServerName,
  ProcessSessionId,
  runBundle
} from "../support/processTestSupport.js"

const Flags = {
  kind: "--kind",
  target: "--path",
  docId: "--doc-id",
  docUrl: "--doc-url",
  folder: "--folder-id",
  server: "--server",
  json: "--json"
} as const
const Commands = {
  init: "init",
  register: "register",
  hook: "hook",
  status: "status"
} as const
const PersonalDrive = "personal"
const TargetPath = "code/claude/wip/CodexContract"
const FixturePath = "tests/fixtures/codex"
const SyncFixture = "post-sync.json"
const SessionFixture = "session-start.json"
const StopFixture = "stop.json"
const ReplyFixture = "post-tool-use-manage-comment-reply.json"
const CommentId = "comment-c1"
const StdinEmpty = ""

describe.each([HostKind.codex, HostKind.opencode])(
  "%s normalized bundled runtime contract",
  host => {
    let environment: BundleTestEnvironment = null
    beforeEach(async () => {
      environment = await createBundleTestEnvironment()
    })
    afterEach(async () => {
      await destroyBundleTestEnvironment(environment)
    })

    async function run(argumentsList: string[], stdin = StdinEmpty) {
      return runBundle(
        environment,
        [
          ...argumentsList,
          NativeTest.HostFlag,
          host,
          NativeTest.StateFlag,
          environment.store.config.stateDirectory
        ],
        { stdin }
      )
    }

    async function fixture(file: string): Promise<Record<string, any>> {
      const input = JSON.parse(
        await readFile(
          path.join(PluginRootPath, FixturePath, file),
          FsUtils.Encoding
        )
      )
      return { ...input, session_id: ProcessSessionId }
    }

    async function hook(input: Record<string, any>) {
      return run([Commands.hook], JSON.stringify(input))
    }

    async function setup() {
      expect(
        (
          await run([
            SnapshotCommand.Name,
            NativeTest.SessionFlag,
            ProcessSessionId,
            NativeTest.PlanFlag,
            environment.planFile
          ])
        ).exitCode
      ).toBe(0)
      expect(
        (
          await run([
            Commands.init,
            NativeTest.SessionFlag,
            ProcessSessionId,
            NativeTest.PlanFlag,
            environment.planFile,
            Flags.kind,
            PersonalDrive,
            Flags.target,
            TargetPath
          ])
        ).exitCode
      ).toBe(0)
      expect(
        (
          await run([
            Commands.register,
            NativeTest.PlanFlag,
            environment.planFile,
            Flags.docId,
            ProcessDocId,
            Flags.docUrl,
            ProcessDocUrl,
            Flags.folder,
            ProcessFolderId,
            Flags.server,
            ProcessServerName
          ])
        ).exitCode
      ).toBe(0)
    }

    async function reviewQuestion(): Promise<PreToolUseHookInput> {
      const menu = await run([
        MenuCommand.Name,
        NativeTest.PlanFlag,
        environment.planFile
      ])
      expect(menu.exitCode).toBe(0)
      return {
        hook_event_name: HookEventName.PreToolUse,
        session_id: ProcessSessionId,
        transcript_path: null,
        permission_mode: NativeTest.PlanMode,
        tool_name: getNativeReviewProtocol(host).toolName,
        tool_use_id: NativeTest.QuestionCallId,
        tool_input: JSON.parse(menu.stdout)
      }
    }

    it("runs two revisions, records a comment, and consumes native approval", async () => {
      await setup()
      await hook(await fixture(SyncFixture))
      const first = await reviewQuestion()
      await hook(first)
      await hook(createNativeAnswer(first, NativeReviewLabel.check))
      expect((await environment.store.load(environment.planSlug)).status).toBe(
        ReviewStatus.active
      )
      expect(
        (
          await run(
            [
              SnapshotCommand.Name,
              NativeTest.SessionFlag,
              ProcessSessionId,
              NativeTest.PlanFlag,
              environment.planFile,
              NativeTest.StdinFlag
            ],
            NativeTest.RevisedPlan
          )
        ).exitCode
      ).toBe(0)
      const sync = await fixture(SyncFixture)
      sync.tool_input.content = NativeTest.RevisedPlan
      await hook(sync)
      await hook({
        ...readHookFixture(ReplyFixture),
        session_id: ProcessSessionId,
        transcript_path: null
      })
      const second = await reviewQuestion()
      await hook(second)
      const response = createNativeAnswer(second, NativeReviewLabel.approve)
      const completed = await hook(response),
        state = await environment.store.load(environment.planSlug)
      expect(completed.stderr).toBe(StdinEmpty)
      expect(state.revision).toBe(NativeTest.Revision + 1)
      expect(state.comments[CommentId].revision).toBe(state.revision)
      expect(state.status).toBe(ReviewStatus.approved)
      expect(state.approvedMode).toBeNull()
      expect(state.decision.source).toBe(
        getNativeReviewProtocol(host).decisionSource
      )
      expect((await hook(response)).stdout).toBe(StdinEmpty)
      expect((await hook(await fixture(StopFixture))).stdout).toBe(StdinEmpty)
    })

    it("records no sync for an MCP error, wrong server, or mismatched content", async () => {
      await setup()
      const sync = await fixture(SyncFixture)
      await hook({
        ...sync,
        tool_response: { ...sync.tool_response, isError: true }
      })
      await hook({
        ...sync,
        tool_name: sync.tool_name.replace(
          ProcessServerName,
          NativeTest.OtherServer
        )
      })
      await hook({
        ...sync,
        tool_input: { ...sync.tool_input, content: NativeTest.RevisedPlan }
      })
      expect(
        (await environment.store.load(environment.planSlug)).lastSync
      ).toBeNull()
      expect(
        (
          await run([
            MenuCommand.Name,
            NativeTest.PlanFlag,
            environment.planFile
          ])
        ).exitCode
      ).not.toBe(0)
    })

    it("handles resume and nullable transcripts and refuses malformed review questions", async () => {
      await setup()
      expect((await hook(await fixture(SessionFixture))).stdout).toContain(
        environment.planFile
      )
      const invalid = {
        hook_event_name: HookEventName.PreToolUse,
        tool_name: getNativeReviewProtocol(host).toolName
      }
      expect((await hook(invalid)).stdout).toContain(PermissionDecision.deny)
      const claude = await runBundle(environment, [
        Commands.status,
        NativeTest.PlanFlag,
        environment.planFile,
        NativeTest.StateFlag,
        environment.store.config.stateDirectory
      ])
      expect(claude.exitCode).not.toBe(0)
      const claudeList = await runBundle(environment, [
        Commands.status,
        Flags.json,
        NativeTest.StateFlag,
        environment.store.config.stateDirectory
      ])
      expect(JSON.parse(claudeList.stdout)).toEqual([])
      const hostList = await run([Commands.status, Flags.json])
      expect(JSON.parse(hostList.stdout)).toHaveLength(1)
    })

    it("creates a managed snapshot from stdin and rejects an empty replacement", async () => {
      const argumentsList = [
          SnapshotCommand.Name,
          NativeTest.SessionFlag,
          ProcessSessionId,
          NativeTest.StdinFlag
        ],
        result = await run(argumentsList, ProcessPlanText),
        snapshot = JSON.parse(result.stdout)
      expect(await readFile(snapshot.planFile, FsUtils.Encoding)).toBe(
        ProcessPlanText
      )
      expect((await run(argumentsList)).exitCode).not.toBe(0)
      expect(await readFile(snapshot.planFile, FsUtils.Encoding)).toBe(
        ProcessPlanText
      )
    })
  }
)
