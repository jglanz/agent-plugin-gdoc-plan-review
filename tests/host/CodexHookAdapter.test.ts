import {
  CodexReviewLabel,
  CodexReviewMenu,
  CodexSessionStore,
  dispatchHook,
  HookEventName,
  HostToolName,
  PermissionDecision,
  PreToolUseHookOutput,
  ReviewApproval,
  ReviewDecisionSource,
  ReviewStatus,
  SessionStartHookOutput,
  StopDecision,
  StopHookInput
} from "claude-gdoc-review-plugin"

import {
  CodexTest,
  createCodexAnswer,
  createCodexQuestion,
  createCodexTestEnvironment
} from "../support/codexTestSupport.js"
import {
  destroyHookTestEnvironment,
  FixtureNow,
  HookTestEnvironment,
  writePlanText
} from "../support/hookTestSupport.js"

describe("Codex native hook adapter", () => {
  let environment: HookTestEnvironment = null
  beforeEach(async () => {
    environment = await createCodexTestEnvironment()
  })
  afterEach(async () => {
    await destroyHookTestEnvironment(environment)
  })

  async function question() {
    return createCodexQuestion(
      environment,
      await environment.store.load(environment.planSlug)
    )
  }

  it("captures native approval once without a permission-mode change", async () => {
    const input = await question(),
      answer = createCodexAnswer(input, CodexReviewLabel.approve)
    expect(await dispatchHook(input, environment.context)).toBeNull()
    await dispatchHook(answer, environment.context)
    const approved = await environment.store.load(environment.planSlug)
    expect(approved.status).toBe(ReviewStatus.approved)
    expect(approved.approvedMode).toBeNull()
    expect(approved.decision.source).toBe(
      ReviewDecisionSource.request_user_input
    )
    expect(approved.decision.consumedAt).toBe(FixtureNow.toISOString())
    expect(await dispatchHook(answer, environment.context)).toBeNull()
    expect(await environment.store.load(environment.planSlug)).toEqual(approved)
  })

  it("never accepts an answer without the matching pre-tool evidence", async () => {
    await dispatchHook(
      createCodexAnswer(await question(), CodexReviewLabel.approve),
      environment.context
    )
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
  })

  it("does not capture questions or answers outside native Plan mode", async () => {
    const input = await question(),
      outsidePlan = { ...input, permission_mode: null }
    expect(await dispatchHook(outsidePlan, environment.context)).toMatchObject({
      hookSpecificOutput: { permissionDecision: PermissionDecision.deny }
    })
    await dispatchHook(input, environment.context)
    await dispatchHook(
      {
        ...createCodexAnswer(input, CodexReviewLabel.approve),
        permission_mode: null
      },
      environment.context
    )
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
  })

  it.each([
    CodexReviewLabel.check,
    CodexReviewLabel.revise,
    CodexTest.RevisedPlan
  ])("keeps nonapproval answer %s active", async answer => {
    const input = await question()
    await dispatchHook(input, environment.context)
    await dispatchHook(createCodexAnswer(input, answer), environment.context)
    expect((await environment.store.load(environment.planSlug)).status).toBe(
      ReviewStatus.active
    )
  })

  it("refuses approval if the plan changes while the question is open", async () => {
    const input = await question()
    await dispatchHook(input, environment.context)
    await writePlanText(environment, CodexTest.RevisedPlan)
    await dispatchHook(
      createCodexAnswer(input, CodexReviewLabel.approve),
      environment.context
    )
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
  })

  it.each([-1, ReviewApproval.MaxDecisionAgeMs])(
    "refuses an answer with age %s",
    async age => {
      const input = await question()
      await dispatchHook(input, environment.context)
      environment.context.now = () => new Date(FixtureNow.getTime() + age)
      await dispatchHook(
        createCodexAnswer(input, CodexReviewLabel.approve),
        environment.context
      )
      expect(
        (await environment.store.load(environment.planSlug)).decision
      ).toBeNull()
    }
  )

  it("does not match another invocation or another session", async () => {
    const input = await question()
    await dispatchHook(input, environment.context)
    const answer = createCodexAnswer(input, CodexReviewLabel.approve)
    await dispatchHook(
      { ...answer, tool_use_id: CodexTest.OtherCallId },
      environment.context
    )
    await dispatchHook(
      { ...answer, session_id: CodexTest.OtherSessionId },
      environment.context
    )
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
  })

  it("denies a stale question and leaves unrelated questions alone", async () => {
    const input = await question()
    await writePlanText(environment, CodexTest.RevisedPlan)
    const denied = (await dispatchHook(
      input,
      environment.context
    )) as PreToolUseHookOutput
    expect(denied.hookSpecificOutput.permissionDecision).toBe(
      PermissionDecision.deny
    )
    input.tool_input = { questions: [{ id: CodexTest.OtherQuestionId }] }
    expect(await dispatchHook(input, environment.context)).toBeNull()
  })

  it.each([
    {},
    {
      answers: {
        [CodexReviewMenu.QuestionId]: {
          answers: [CodexReviewLabel.approve, CodexReviewLabel.check]
        }
      }
    }
  ])("does not accept cancellation or multiple answers: %j", async response => {
    const input = await question()
    await dispatchHook(input, environment.context)
    await dispatchHook(
      {
        ...createCodexAnswer(input, CodexReviewLabel.approve),
        tool_response: response
      },
      environment.context
    )
    expect(
      (await environment.store.load(environment.planSlug)).decision
    ).toBeNull()
  })

  it("restores explicit session context without reading a transcript", async () => {
    const output = (await dispatchHook(
      {
        hook_event_name: HookEventName.SessionStart,
        session_id: environment.sessionId,
        transcript_path: null
      },
      environment.context
    )) as SessionStartHookOutput
    expect(output.hookSpecificOutput.additionalContext).toContain(
      environment.planFile
    )
    expect(output.hookSpecificOutput.additionalContext).not.toContain(
      HostToolName.ExitPlanMode
    )
  })

  it("never handles Claude permission updates in Codex", async () => {
    expect(
      await dispatchHook(
        {
          ...(await question()),
          hook_event_name: HookEventName.PermissionRequest,
          tool_name: HostToolName.ExitPlanMode
        },
        environment.context
      )
    ).toBeNull()
  })

  it("bounds stop reminders and permits waiting for a user", async () => {
    const input: StopHookInput = {
      hook_event_name: HookEventName.Stop,
      session_id: environment.sessionId,
      transcript_path: null,
      turn_id: CodexTest.TurnId,
      stop_hook_active: false
    }
    expect(await dispatchHook(input, environment.context)).toMatchObject({
      decision: StopDecision.block
    })
    expect(await dispatchHook(input, environment.context)).toBeNull()
    expect(
      await dispatchHook(
        { ...input, stop_hook_active: true },
        environment.context
      )
    ).toBeNull()
  })

  it("refuses a binding to another session's review", async () => {
    await new CodexSessionStore(environment.statePath).bind(
      CodexTest.OtherSessionId,
      environment.planFile
    )
    await expect(
      dispatchHook(
        { ...(await question()), session_id: CodexTest.OtherSessionId },
        environment.context
      )
    ).rejects.toThrow()
  })
})
