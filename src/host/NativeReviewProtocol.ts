import Assert from "node:assert"

import { HostToolName } from "../hooks/HookInput.js"
import { CodexReviewMenu } from "../round/CodexReviewMenu.js"
import { OpenCodeReviewMenu } from "../round/OpenCodeReviewMenu.js"
import { NativeReviewMenu } from "../round/NativeReviewMenu.js"
import { ReviewDecisionSource, ReviewState } from "../state/index.js"
import { isNonEmptyString, isRecord } from "../utils/index.js"
import { HostKind } from "./HostRuntime.js"

/** Only the native wire format changes between session-bound harnesses. */
export interface NativeReviewProtocol {
  /** Tool carrying a genuine native user decision. */
  toolName: HostToolName
  /** Persisted provenance of that decision. */
  decisionSource: ReviewDecisionSource
  /** Detects our question without capturing unrelated questions. */
  isReviewQuestion(questions: unknown): boolean
  /** Validates every offered field against the current review. */
  matches(questions: unknown, state: ReviewState, digest: string): boolean
  /** Creates the host-specific question object. */
  createQuestion(state: ReviewState, digest: string): unknown
  /** Reads one native host answer; never parses assistant-authored display text. */
  readAnswer(response: unknown): string
}

function codexAnswer(response: unknown): string {
  if (!isRecord(response) || !isRecord(response.answers)) return null
  const answer = response.answers[CodexReviewMenu.QuestionId]
  return isRecord(answer) ? singleAnswer(answer.answers) : null
}

function singleAnswer(answers: unknown): string {
  return Array.isArray(answers) &&
    answers.length === 1 &&
    isNonEmptyString(answers[0])
    ? answers[0]
    : null
}

function openCodeAnswer(response: unknown): string {
  if (!isRecord(response) || !isRecord(response.metadata)) return null
  const { answers } = response.metadata
  return Array.isArray(answers) && answers.length === 1
    ? singleAnswer(answers[0])
    : null
}

/** Resolves a registered native-question protocol; absent adapters fail closed. */
export function getNativeReviewProtocol(host: HostKind): NativeReviewProtocol {
  const protocols: Partial<Record<HostKind, NativeReviewProtocol>> = {
      [HostKind.codex]: {
        toolName: HostToolName.request_user_input,
        decisionSource: ReviewDecisionSource.request_user_input,
        isReviewQuestion: questions =>
          Array.isArray(questions) &&
          questions.some(
            question =>
              isRecord(question) && question.id === CodexReviewMenu.QuestionId
          ),
        matches: CodexReviewMenu.matches,
        createQuestion: CodexReviewMenu.createQuestion,
        readAnswer: codexAnswer
      },
      [HostKind.opencode]: {
        toolName: HostToolName.question,
        decisionSource: ReviewDecisionSource.opencode_question,
        isReviewQuestion: questions =>
          Array.isArray(questions) &&
          questions.some(
            question =>
              isRecord(question) && question.header === NativeReviewMenu.Header
          ),
        matches: OpenCodeReviewMenu.matches,
        createQuestion: OpenCodeReviewMenu.createQuestion,
        readAnswer: openCodeAnswer
      }
    },
    protocol = Object.hasOwn(protocols, host) ? protocols[host] : null
  Assert.ok(
    protocol != null,
    `No native review question adapter is implemented for ${host}`
  )
  return protocol
}
