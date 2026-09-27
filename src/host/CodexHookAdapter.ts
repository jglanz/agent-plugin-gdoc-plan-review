import { match } from "ts-pattern"

import { extractDocumentId, WorkspaceToolName } from "../google/index.js"
import type { HookContext } from "../hooks/HookContext.js"
import {
  HookEventName,
  HookInput,
  HostToolName,
  PostToolUseHookInput,
  PreToolUseHookInput,
  StopHookInput
} from "../hooks/HookInput.js"
import { HookOutput } from "../hooks/HookOutput.js"
import { locateReview } from "../hooks/ReviewLookup.js"
import { handleSyncRecorder } from "../hooks/handlers/SyncRecorderHandler.js"
import { handleCommentRecorder } from "../hooks/handlers/CommentRecorderHandler.js"
import { sha256OfFile } from "../plan/index.js"
import {
  evaluateReview,
  ReviewApproval,
  ReviewReadiness
} from "../review/index.js"
import {
  CodexReviewLabel,
  CodexReviewMenu,
  RoundProtocolRenderer
} from "../round/index.js"
import {
  ReviewDecisionChoice,
  ReviewDecisionSource,
  ReviewState,
  ReviewStatus
} from "../state/index.js"
import { isNonEmptyString, isRecord } from "../utils/index.js"
import { CodexSessionStore } from "./CodexSessionStore.js"
import { CodexSupport } from "./CodexSupport.js"

/** Codex adapter protocol constants. */
export namespace CodexHookAdapter {
  /** Question is unavailable outside native Plan mode. */
  export const PlanPermissionMode = "plan"
  /** Source of a successful Codex review completion message. */
  export const ApprovedMessage =
    "Google Doc review approved. Keep native Plan mode and permissions unchanged. Present the reviewed plan and Doc link; implementation requires the user's native execution action."
  /** Refusal when the question is not about the synchronized revision. */
  export const UnsyncedMessage =
    "The review question does not match the current synchronized plan. Complete the authorized review round before asking for approval."
  /** File containing the Codex-specific review instructions. */
  export const ProtocolSubpath = "skills/gdoc-review/CODEX.md"
}

function sessionStore(context: HookContext): CodexSessionStore {
  return new CodexSessionStore(context.store.config.stateDirectory)
}

function isReviewQuestion(
  input: PreToolUseHookInput | PostToolUseHookInput
): boolean {
  const { questions } = input.tool_input
  return (
    Array.isArray(questions) &&
    questions.some(
      question =>
        isRecord(question) && question.id === CodexReviewMenu.QuestionId
    )
  )
}

async function captureQuestion(
  input: PreToolUseHookInput,
  context: HookContext
): Promise<HookOutput.Any> {
  if (
    input.tool_name !== HostToolName.request_user_input ||
    !isReviewQuestion(input)
  )
    return HookOutput.none()
  const review = await locateReview(input, context)
  if (
    review == null ||
    review.state == null ||
    input.permission_mode !== CodexHookAdapter.PlanPermissionMode
  )
    return HookOutput.preToolUseDeny(CodexHookAdapter.UnsyncedMessage)
  const { state, planFile } = review,
    digest = await sha256OfFile(planFile)
  if (
    state.status !== ReviewStatus.active ||
    state.doc == null ||
    state.lastSync == null ||
    state.lastSync.planSha256 !== digest ||
    !isNonEmptyString(digest) ||
    !isNonEmptyString(input.tool_use_id) ||
    !CodexReviewMenu.matches(input.tool_input.questions, state, digest)
  )
    return HookOutput.preToolUseDeny(CodexHookAdapter.UnsyncedMessage)
  const store = sessionStore(context),
    session = await store.read(input.session_id)
  await store.save(input.session_id, {
    ...session,
    pendingQuestion: {
      toolUseId: input.tool_use_id,
      planSha256: digest,
      revision: state.revision,
      docId: state.doc.id,
      serverName: state.doc.serverName,
      at: context.now().toISOString()
    },
    waitingForUser: true
  })
  return HookOutput.none()
}

function readAnswer(response: unknown): string {
  if (!isRecord(response) || !isRecord(response.answers)) return null
  const answer = response.answers[CodexReviewMenu.QuestionId]
  return isRecord(answer) &&
    Array.isArray(answer.answers) &&
    answer.answers.length === 1 &&
    isNonEmptyString(answer.answers[0])
    ? answer.answers[0]
    : null
}

function choiceOf(answer: string): ReviewDecisionChoice {
  return match(answer)
    .with(CodexReviewLabel.approve, () => ReviewDecisionChoice.approve_review)
    .with(CodexReviewLabel.check, () => ReviewDecisionChoice.check_doc)
    .otherwise(() => ReviewDecisionChoice.other)
}

async function captureAnswer(
  input: PostToolUseHookInput,
  context: HookContext
): Promise<HookOutput.Any> {
  const store = sessionStore(context),
    session = await store.read(input.session_id)
  if (
    input.permission_mode !== CodexHookAdapter.PlanPermissionMode ||
    session == null ||
    session.pendingQuestion == null
  )
    return HookOutput.none()
  const pending = session.pendingQuestion,
    review = await locateReview(input, context)
  if (
    review == null ||
    review.state == null ||
    pending.toolUseId !== input.tool_use_id
  )
    return HookOutput.none()
  // Consume the pending call before saving an approval; a failed save cannot replay it.
  await store.save(input.session_id, { ...session, pendingQuestion: null })
  const { state } = review,
    digest = await sha256OfFile(review.planFile),
    now = context.now(),
    ageMs = now.getTime() - Date.parse(pending.at),
    answer = readAnswer(input.tool_response)
  if (
    state.status !== ReviewStatus.active ||
    state.doc == null ||
    state.lastSync == null ||
    state.lastSync.planSha256 !== digest ||
    pending.planSha256 !== digest ||
    state.revision !== pending.revision ||
    state.doc.id !== pending.docId ||
    state.doc.serverName !== pending.serverName ||
    !Number.isFinite(ageMs) ||
    ageMs < 0 ||
    ageMs >= ReviewApproval.MaxDecisionAgeMs ||
    !CodexReviewMenu.matches(input.tool_input.questions, state, digest) ||
    answer == null
  )
    return HookOutput.none()
  const choice = choiceOf(answer),
    approved = choice === ReviewDecisionChoice.approve_review,
    text =
      choice === ReviewDecisionChoice.other &&
      answer !== CodexReviewLabel.revise
        ? answer
        : null,
    next: ReviewState = {
      ...state,
      decision: {
        choice,
        label: answer,
        text,
        planSha256: digest,
        at: now.toISOString(),
        source: ReviewDecisionSource.request_user_input,
        toolUseId: pending.toolUseId,
        consumedAt: approved ? now.toISOString() : null
      },
      status: approved ? ReviewStatus.approved : ReviewStatus.active,
      approvedAt: approved ? now.toISOString() : null,
      approvedMode: null
    }
  await context.store.save(next)
  await store.save(input.session_id, {
    ...session,
    pendingQuestion: null,
    waitingForUser: choice === ReviewDecisionChoice.other && text == null
  })
  return HookOutput.postToolUseContext(
    approved
      ? CodexHookAdapter.ApprovedMessage
      : choice === ReviewDecisionChoice.check_doc
        ? "Re-read Google Doc feedback and prepare the next review revision. " +
          CodexSupport.Message
        : text == null
          ? "Ask the user which plan changes they want."
          : RoundProtocolRenderer.newUserInstructionBlock(text)
  )
}

async function recordTool(
  input: PostToolUseHookInput,
  context: HookContext
): Promise<HookOutput.Any> {
  if (input.tool_name === HostToolName.request_user_input)
    return captureAnswer(input, context)
  const reference = WorkspaceToolName.parse(input.tool_name)
  if (
    reference == null ||
    (isRecord(input.tool_response) && input.tool_response.isError === true)
  )
    return HookOutput.none()
  const review = await locateReview(input, context)
  if (review == null || review.state == null) return HookOutput.none()
  const { state } = review
  if (state.doc != null && state.doc.serverName !== reference.serverName)
    return HookOutput.none()
  if (reference.tool === WorkspaceToolName.manage_document_comment) {
    if (
      state.doc == null ||
      extractDocumentId(String(input.tool_input.document_id)) !== state.doc.id
    )
      return HookOutput.none()
    return handleCommentRecorder(input, context)
  }
  return handleSyncRecorder(input, context)
}

async function remindSession(
  input: HookInput,
  context: HookContext
): Promise<HookOutput.Any> {
  const review = await locateReview(input, context)
  if (review == null || review.state == null)
    return HookOutput.sessionStartContext(
      `gdoc-review host session id: ${input.session_id}. ${CodexSupport.Message}`
    )
  return HookOutput.sessionStartContext(
    `Google Doc review ${review.state.status}; plan snapshot: ${review.planFile}. Read ${CodexHookAdapter.ProtocolSubpath}. ${CodexSupport.Message}`
  )
}

async function remindStop(
  input: StopHookInput,
  context: HookContext
): Promise<HookOutput.Any> {
  const store = sessionStore(context),
    session = await store.read(input.session_id)
  if (
    session == null ||
    session.waitingForUser ||
    input.stop_hook_active ||
    session.lastStopTurnId === input.turn_id
  )
    return HookOutput.none()
  const review = await locateReview(input, context)
  if (review == null || review.state == null) return HookOutput.none()
  const readiness = evaluateReview(
    review.state,
    await sha256OfFile(review.planFile),
    context.now()
  )
  if (readiness === ReviewReadiness.inactive) return HookOutput.none()
  await store.save(input.session_id, {
    ...session,
    lastStopTurnId: input.turn_id,
    waitingForUser: true
  })
  return HookOutput.stopReminder(
    `Google Doc review is pending (${readiness}). Report the pending step without claiming approval. ${CodexSupport.Message}`
  )
}

/** Maps Codex events to shared recorders and native approval evidence. */
export async function dispatchCodexHook(
  input: HookInput,
  context: HookContext
): Promise<HookOutput.Any> {
  return match(input)
    .with({ hook_event_name: HookEventName.SessionStart }, value =>
      remindSession(value, context)
    )
    .with({ hook_event_name: HookEventName.PreToolUse }, value =>
      captureQuestion(value, context)
    )
    .with({ hook_event_name: HookEventName.PostToolUse }, value =>
      recordTool(value, context)
    )
    .with({ hook_event_name: HookEventName.Stop }, value =>
      remindStop(value, context)
    )
    .otherwise(() => HookOutput.none())
}
