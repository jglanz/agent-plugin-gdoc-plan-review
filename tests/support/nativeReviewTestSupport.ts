import {
  getNativeReviewProtocol,
  CodexReviewMenu,
  ReviewSessionStore,
  HostKind,
  HookEventName,
  HostToolName,
  PostToolUseHookInput,
  PreToolUseHookInput,
  ReviewState
} from "claude-gdoc-review-plugin"

import {
  createActiveReviewState,
  createHookTestEnvironment,
  FixtureNow,
  HookTestEnvironment,
  writePlanText
} from "./hookTestSupport.js"

/** Shared operational fixture values for native harness contract tests. */
export namespace NativeTest {
  /** Initial complete plan. */
  export const Plan = "# Reviewed plan\n\nImplement the agreed behavior.\n"
  /** Changed full plan. */
  export const RevisedPlan = "# Reviewed plan\n\nAdd a rollback section.\n"
  /** First synchronized revision. */
  export const Revision = 1
  /** Host question invocation. */
  export const QuestionCallId = "codex-question-1"
  /** Unrelated host invocation. */
  export const OtherCallId = "codex-question-2"
  /** Unrelated session. */
  export const OtherSessionId = "codex-other-session"
  /** Native planning permission mode. */
  export const PlanMode = "plan"
  /** First host turn. */
  export const TurnId = "codex-turn-1"
  /** Different native question id. */
  export const OtherQuestionId = "unrelated"
  /** CLI host flag. */
  export const HostFlag = "--host"
  /** CLI session flag. */
  export const SessionFlag = "--session-id"
  /** CLI plan flag. */
  export const PlanFlag = "--plan"
  /** CLI input flag. */
  export const StdinFlag = "--stdin"
  /** CLI state override. */
  export const StateFlag = "--state-dir"
  /** JSON property name read from a capability response. */
  export const VerifiedKey = "inPlanWritesVerified"
  /** Wrong file/server fixture. */
  export const OtherServer = "other-server"
}

/** Creates an isolated, synchronized native-harness review. */
export async function createNativeTestEnvironment(
  host: HostKind = HostKind.codex
): Promise<HookTestEnvironment> {
  const environment = await createHookTestEnvironment()
  environment.context.host = host
  const digest = await writePlanText(environment, NativeTest.Plan)
  await new ReviewSessionStore(environment.statePath, host).bind(
    environment.sessionId,
    environment.planFile
  )
  await environment.store.save(
    createActiveReviewState(environment, {
      host,
      ownerSessionId: environment.sessionId,
      revision: NativeTest.Revision,
      lastSync: {
        at: FixtureNow.toISOString(),
        planSha256: digest,
        revision: NativeTest.Revision
      }
    })
  )
  return environment
}

/** Creates a host-authored PreToolUse payload for the canonical native question. */
export function createNativeQuestion(
  environment: HookTestEnvironment,
  state: ReviewState
): PreToolUseHookInput {
  const protocol = getNativeReviewProtocol(environment.context.host)
  return {
    hook_event_name: HookEventName.PreToolUse,
    session_id: environment.sessionId,
    transcript_path: null,
    permission_mode: NativeTest.PlanMode,
    tool_name: protocol.toolName,
    tool_use_id: NativeTest.QuestionCallId,
    tool_input: {
      questions: [protocol.createQuestion(state, state.lastSync.planSha256)]
    }
  }
}

/** Creates the response event for the same native invocation. */
export function createNativeAnswer(
  question: PreToolUseHookInput,
  answer: string
): PostToolUseHookInput {
  return {
    ...question,
    hook_event_name: HookEventName.PostToolUse,
    tool_response:
      question.tool_name === HostToolName.question
        ? { metadata: { answers: [[answer]] } }
        : { answers: { [CodexReviewMenu.QuestionId]: { answers: [answer] } } }
  }
}
