import {
  HostKind,
  getNativeReviewProtocol,
  NativeReviewLabel,
  CodexReviewMenu,
  ReviewSessionStore,
  dispatchHook,
  HookEventName,
  HostToolName,
  PermissionDecision,
  PreToolUseHookOutput,
  ReviewApproval,
  ReviewStatus,
  SessionStartHookOutput,
  StopDecision,
  StopHookInput
} from "claude-gdoc-review-plugin"

import {
  NativeTest,
  createNativeAnswer,
  createNativeQuestion,
  createNativeTestEnvironment
} from "../support/nativeReviewTestSupport.js"
import {
  destroyHookTestEnvironment,
  FixtureNow,
  HookTestEnvironment,
  writePlanText
} from "../support/hookTestSupport.js"

describe.each([HostKind.codex, HostKind.opencode])(
  "%s native hook adapter",
  host => {
    let environment: HookTestEnvironment = null
    beforeEach(async () => {
      environment = await createNativeTestEnvironment(host)
    })
    afterEach(async () => {
      await destroyHookTestEnvironment(environment)
    })

    async function question() {
      return createNativeQuestion(
        environment,
        await environment.store.load(environment.planSlug)
      )
    }

    it("captures native approval once without a permission-mode change", async () => {
      const input = await question(),
        answer = createNativeAnswer(input, NativeReviewLabel.approve)
      expect(await dispatchHook(input, environment.context)).toBeNull()
      await dispatchHook(answer, environment.context)
      const approved = await environment.store.load(environment.planSlug)
      expect(approved.status).toBe(ReviewStatus.approved)
      expect(approved.approvedMode).toBeNull()
      expect(approved.decision.source).toBe(
        getNativeReviewProtocol(host).decisionSource
      )
      expect(approved.decision.consumedAt).toBe(FixtureNow.toISOString())
      expect(await dispatchHook(answer, environment.context)).toBeNull()
      expect(await environment.store.load(environment.planSlug)).toEqual(
        approved
      )
    })

    it("never accepts an answer without the matching pre-tool evidence", async () => {
      await dispatchHook(
        createNativeAnswer(await question(), NativeReviewLabel.approve),
        environment.context
      )
      expect(
        (await environment.store.load(environment.planSlug)).decision
      ).toBeNull()
    })

    it("does not capture questions or answers outside native Plan mode", async () => {
      const input = await question(),
        outsidePlan = { ...input, permission_mode: null }
      expect(
        await dispatchHook(outsidePlan, environment.context)
      ).toMatchObject({
        hookSpecificOutput: { permissionDecision: PermissionDecision.deny }
      })
      await dispatchHook(input, environment.context)
      await dispatchHook(
        {
          ...createNativeAnswer(input, NativeReviewLabel.approve),
          permission_mode: null
        },
        environment.context
      )
      expect(
        (await environment.store.load(environment.planSlug)).decision
      ).toBeNull()
    })

    it.each([
      NativeReviewLabel.check,
      NativeReviewLabel.revise,
      NativeTest.RevisedPlan
    ])("keeps nonapproval answer %s active", async answer => {
      const input = await question()
      await dispatchHook(input, environment.context)
      await dispatchHook(createNativeAnswer(input, answer), environment.context)
      expect((await environment.store.load(environment.planSlug)).status).toBe(
        ReviewStatus.active
      )
    })

    it("refuses approval if the plan changes while the question is open", async () => {
      const input = await question()
      await dispatchHook(input, environment.context)
      await writePlanText(environment, NativeTest.RevisedPlan)
      await dispatchHook(
        createNativeAnswer(input, NativeReviewLabel.approve),
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
          createNativeAnswer(input, NativeReviewLabel.approve),
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
      const answer = createNativeAnswer(input, NativeReviewLabel.approve)
      await dispatchHook(
        { ...answer, tool_use_id: NativeTest.OtherCallId },
        environment.context
      )
      await dispatchHook(
        { ...answer, session_id: NativeTest.OtherSessionId },
        environment.context
      )
      expect(
        (await environment.store.load(environment.planSlug)).decision
      ).toBeNull()
    })

    it("denies a stale question and leaves unrelated questions alone", async () => {
      const input = await question()
      await writePlanText(environment, NativeTest.RevisedPlan)
      const denied = (await dispatchHook(
        input,
        environment.context
      )) as PreToolUseHookOutput
      expect(denied.hookSpecificOutput.permissionDecision).toBe(
        PermissionDecision.deny
      )
      input.tool_input = { questions: [{ id: NativeTest.OtherQuestionId }] }
      expect(await dispatchHook(input, environment.context)).toBeNull()
    })

    it.each([
      {},
      {
        answers: {
          [CodexReviewMenu.QuestionId]: {
            answers: [NativeReviewLabel.approve, NativeReviewLabel.check]
          }
        }
      }
    ])(
      "does not accept cancellation or multiple answers: %j",
      async response => {
        const input = await question()
        await dispatchHook(input, environment.context)
        await dispatchHook(
          {
            ...createNativeAnswer(input, NativeReviewLabel.approve),
            tool_response: response
          },
          environment.context
        )
        expect(
          (await environment.store.load(environment.planSlug)).decision
        ).toBeNull()
      }
    )

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

    it("never handles Claude permission updates in a native-question adapter", async () => {
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
        turn_id: NativeTest.TurnId,
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
      await new ReviewSessionStore(environment.statePath, host).bind(
        NativeTest.OtherSessionId,
        environment.planFile
      )
      await expect(
        dispatchHook(
          { ...(await question()), session_id: NativeTest.OtherSessionId },
          environment.context
        )
      ).rejects.toThrow()
    })
  }
)
