import {
  CodexReviewMenu,
  CodexSessionStore,
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

/** Shared operational fixture values for Codex contract tests. */
export namespace CodexTest {
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

/** Creates an isolated, synchronized Codex review. */
export async function createCodexTestEnvironment(): Promise<HookTestEnvironment> {
  const environment = await createHookTestEnvironment()
  environment.context.host = HostKind.codex
  const digest = await writePlanText(environment, CodexTest.Plan)
  await new CodexSessionStore(environment.statePath).bind(
    environment.sessionId,
    environment.planFile
  )
  await environment.store.save(
    createActiveReviewState(environment, {
      host: HostKind.codex,
      ownerSessionId: environment.sessionId,
      revision: CodexTest.Revision,
      lastSync: {
        at: FixtureNow.toISOString(),
        planSha256: digest,
        revision: CodexTest.Revision
      }
    })
  )
  return environment
}

/** Creates a host-authored PreToolUse payload for the canonical native question. */
export function createCodexQuestion(
  environment: HookTestEnvironment,
  state: ReviewState
): PreToolUseHookInput {
  return {
    hook_event_name: HookEventName.PreToolUse,
    session_id: environment.sessionId,
    transcript_path: null,
    permission_mode: CodexTest.PlanMode,
    tool_name: HostToolName.request_user_input,
    tool_use_id: CodexTest.QuestionCallId,
    tool_input: {
      questions: [
        CodexReviewMenu.createQuestion(state, state.lastSync.planSha256)
      ]
    }
  }
}

/** Creates the response event for the same native invocation. */
export function createCodexAnswer(
  question: PreToolUseHookInput,
  answer: string
): PostToolUseHookInput {
  return {
    ...question,
    hook_event_name: HookEventName.PostToolUse,
    tool_response: {
      answers: { [CodexReviewMenu.QuestionId]: { answers: [answer] } }
    }
  }
}
