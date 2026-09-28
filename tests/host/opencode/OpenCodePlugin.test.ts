import {
  createOpenCodeHooks,
  HostKind,
  HostToolName,
  NativeReviewLabel,
  OpenCodePlugin,
  OpenCodeReviewMenu,
  ReviewDecisionSource,
  ReviewStatus,
  WorkspaceToolName
} from "claude-gdoc-review-plugin"

import {
  createNativeTestEnvironment,
  NativeTest
} from "../../support/nativeReviewTestSupport.js"
import {
  destroyHookTestEnvironment,
  FixtureDocId,
  FixtureServerName,
  HookTestEnvironment,
  readHookFixture,
  writePlanText
} from "../../support/hookTestSupport.js"
import { PluginRootPath } from "../../support/processTestSupport.js"

type OpenCodeHooks = Awaited<ReturnType<typeof createOpenCodeHooks>>
type NativeEvent = Parameters<OpenCodeHooks["event"]>[0]
type ChatParametersInput = Parameters<OpenCodeHooks["chat.params"]>[0]
type NativeToolInput = Parameters<OpenCodeHooks["tool.execute.before"]>[0]
type NativeToolOutput = Parameters<OpenCodeHooks["tool.execute.after"]>[1]
type OpenCodeConfig = Parameters<OpenCodeHooks["config"]>[0]
type ContextToolInput = Parameters<OpenCodeHooks["tool"][string]["execute"]>[1]
interface McpFixture {
  tool_input: Record<string, any>
  tool_response: Record<string, any>
}

const BuildAgent = "build"
const ToolTitle = "Asked one question"
const ToolText = "User has answered the native question."
const SyncFixture = "post-tool-use-update-drive-file.json"
const ReplyFixture = "post-tool-use-manage-comment-reply.json"
const CustomCommand = "User-defined review command"
const UnrelatedTool = "read"

function mcpFixture(file: string): McpFixture {
  const fixture = readHookFixture(file)
  return {
    tool_input: fixture.tool_input as Record<string, any>,
    tool_response: {
      content: [
        { type: OpenCodePlugin.TextContentType, text: fixture.tool_response }
      ],
      isError: false
    }
  }
}

describe("stock OpenCode plugin hooks", () => {
  let environment: HookTestEnvironment = null,
    hooks: OpenCodeHooks = null

  beforeEach(async () => {
    environment = await createNativeTestEnvironment(HostKind.opencode)
    hooks = await createOpenCodeHooks({
      context: environment.context,
      pluginRoot: PluginRootPath
    })
    await hooks.config({
      mcp: { [FixtureServerName]: { type: "local", command: [] } }
    })
    await setAgent(OpenCodePlugin.PlanAgent)
  })
  afterEach(async () => {
    await hooks.dispose()
    await destroyHookTestEnvironment(environment)
  })

  async function setAgent(agent: string) {
    await hooks["chat.params"](
      { sessionID: environment.sessionId, agent } as ChatParametersInput,
      null
    )
  }
  function input(tool = HostToolName.question): NativeToolInput {
    return {
      tool,
      sessionID: environment.sessionId,
      callID: NativeTest.QuestionCallId
    }
  }
  async function questionArguments() {
    const state = await environment.store.load(environment.planSlug)
    return {
      questions: [
        OpenCodeReviewMenu.createQuestion(state, state.lastSync.planSha256)
      ]
    }
  }
  function answer(
    labels: string[] = [NativeReviewLabel.approve]
  ): NativeToolOutput {
    return {
      title: ToolTitle,
      output: ToolText,
      metadata: { answers: [labels] }
    }
  }
  async function sync() {
    const fixture = mcpFixture(SyncFixture),
      output = structuredClone(fixture.tool_response),
      args = {
        ...fixture.tool_input,
        file_id: FixtureDocId,
        content: NativeTest.Plan
      }
    // The published Hooks type describes built-ins; MCP callbacks receive raw results in 1.18.32.
    await hooks["tool.execute.after"](
      {
        ...input(),
        tool: `${FixtureServerName}_${WorkspaceToolName.update_drive_file}`,
        args
      },
      output as NativeToolOutput
    )
    return output
  }

  it("consumes a real native answer once and never changes host permissions", async () => {
    const args = await questionArguments(),
      response = answer()
    await hooks["tool.execute.before"](input(), { args })
    await hooks["tool.execute.after"]({ ...input(), args }, response)
    const state = await environment.store.load(environment.planSlug)
    expect(state.status).toBe(ReviewStatus.approved)
    expect(state.approvedMode).toBeNull()
    expect(state.decision.source).toBe(ReviewDecisionSource.opencode_question)
    expect(state.decision.consumedAt).toBeTruthy()
    expect(response.output).toContain("Google Doc review approved")
    await hooks["tool.execute.after"]({ ...input(), args }, answer())
    expect(await environment.store.load(environment.planSlug)).toEqual(state)
    expect(hooks["permission.ask"]).toBeUndefined()
  })

  it.each([
    NativeReviewLabel.check,
    NativeReviewLabel.revise,
    NativeTest.RevisedPlan
  ])("keeps %s active", async label => {
    const args = await questionArguments()
    await hooks["tool.execute.before"](input(), { args })
    await hooks["tool.execute.after"]({ ...input(), args }, answer([label]))
    expect((await environment.store.load(environment.planSlug)).status).toBe(
      ReviewStatus.active
    )
  })

  it("rejects a stale question, and refuses questions outside the plan agent", async () => {
    const args = await questionArguments()
    await setAgent(BuildAgent)
    await expect(
      hooks["tool.execute.before"](input(), { args })
    ).rejects.toThrow()
    await setAgent(OpenCodePlugin.PlanAgent)
    await writePlanText(environment, NativeTest.RevisedPlan)
    await expect(
      hooks["tool.execute.before"](input(), { args })
    ).rejects.toThrow()
  })

  it("does not infer approval from response text, multiple answers, or missing pre-tool evidence", async () => {
    const args = await questionArguments()
    await hooks["tool.execute.after"]({ ...input(), args }, answer())
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
    await hooks["tool.execute.before"](input(), { args })
    await hooks["tool.execute.after"](
      { ...input(), args },
      { ...answer(), metadata: {} }
    )
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
    await hooks["tool.execute.before"](input(), { args })
    await hooks["tool.execute.after"](
      { ...input(), args },
      answer([NativeReviewLabel.approve, NativeReviewLabel.check])
    )
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
  })

  it("records successful raw MCP responses and appends feedback in the MCP shape", async () => {
    const output = await sync()
    expect((await environment.store.load(environment.planSlug)).revision).toBe(
      NativeTest.Revision + 1
    )
    expect(output.content.at(-1).text).toContain("revision 2 synced")
    const reply = mcpFixture(ReplyFixture)
    await hooks["tool.execute.after"](
      {
        ...input(),
        tool: `${FixtureServerName}_${WorkspaceToolName.manage_document_comment}`,
        args: reply.tool_input
      },
      reply.tool_response as NativeToolOutput
    )
    expect(
      Object.keys((await environment.store.load(environment.planSlug)).comments)
    ).toHaveLength(1)
  })

  it("ignores failed writes, unrelated tools, and unconfigured MCP server names", async () => {
    const fixture = mcpFixture(SyncFixture),
      state = await environment.store.load(environment.planSlug)
    await hooks["tool.execute.after"](
      {
        ...input(),
        tool: `${FixtureServerName}_${WorkspaceToolName.update_drive_file}`,
        args: { ...fixture.tool_input, content: NativeTest.Plan }
      },
      { ...fixture.tool_response, isError: true } as unknown as NativeToolOutput
    )
    await hooks["tool.execute.before"](
      { ...input(), tool: UnrelatedTool },
      { args: {} }
    )
    await hooks["tool.execute.after"](
      { ...input(), tool: UnrelatedTool, args: {} },
      answer()
    )
    await hooks.config({})
    await sync()
    expect(await environment.store.load(environment.planSlug)).toEqual(state)
  })

  it("supplies real session context and restores binding context after compaction", async () => {
    const tool = hooks.tool[OpenCodePlugin.ContextToolName],
      nativeContext = {
        sessionID: environment.sessionId,
        agent: OpenCodePlugin.PlanAgent
      } as ContextToolInput,
      result = JSON.parse(String(await tool.execute({}, nativeContext)))
    expect(result.sessionId).toBe(environment.sessionId)
    expect(result.planFile).toBe(environment.planFile)
    const system = { system: [] as string[] },
      compacting = { context: [] as string[] }
    await hooks["experimental.chat.system.transform"](
      { sessionID: environment.sessionId, model: null },
      system
    )
    await hooks["experimental.session.compacting"](
      { sessionID: environment.sessionId },
      compacting
    )
    expect(system.system.join()).toContain(environment.planFile)
    expect(compacting.context).toEqual(system.system)
    const unrelated = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"](
      { sessionID: NativeTest.OtherSessionId, model: null },
      unrelated
    )
    await hooks["experimental.chat.system.transform"](
      { model: null },
      unrelated
    )
    expect(unrelated.system).toEqual([])
  })

  it("clears native agent evidence only for the deleted session", async () => {
    const args = await questionArguments()
    await hooks.event({
      event: {
        type: OpenCodePlugin.SessionDeletedEvent,
        properties: { info: { id: NativeTest.OtherSessionId } }
      }
    } as NativeEvent)
    await hooks["tool.execute.before"](input(), { args })
    await hooks.event({
      event: {
        type: OpenCodePlugin.SessionDeletedEvent,
        properties: { info: { id: environment.sessionId } }
      }
    } as NativeEvent)
    await expect(
      hooks["tool.execute.before"](input(), { args })
    ).rejects.toThrow()
    await hooks["tool.execute.after"]({ ...input(), args }, answer())
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
  })

  it("preserves an existing user command and fails safely after lifecycle disposal", async () => {
    const config: OpenCodeConfig = {
      command: { [OpenCodePlugin.CommandName]: { template: CustomCommand } }
    }
    await hooks.config(config)
    expect(config.command[OpenCodePlugin.CommandName].template).toBe(
      CustomCommand
    )
    const empty: OpenCodeConfig = {}
    await hooks.config(empty)
    expect(empty.command[OpenCodePlugin.CommandName].template).toContain(
      OpenCodePlugin.ContextToolName
    )
    const args = await questionArguments()
    await hooks.dispose()
    await expect(
      hooks["tool.execute.before"](input(), { args })
    ).rejects.toThrow()
    await expect(
      createOpenCodeHooks({
        context: { ...environment.context, host: HostKind.claude }
      })
    ).rejects.toThrow()
    expect(
      OpenCodePlugin.OptionsSchema.safeParse({ permission: true }).success
    ).toBe(false)
  })
})
