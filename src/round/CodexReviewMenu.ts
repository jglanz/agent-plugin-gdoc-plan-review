import { z } from "zod"

import { ReviewState } from "../state/index.js"
import { NativeReviewMenu, NativeReviewQuestion } from "./NativeReviewMenu.js"

/** Codex identifies its native answer by question id. */
export interface CodexReviewQuestion extends NativeReviewQuestion {
  /** Stable response key. */
  id: string
}

/** Codex request_user_input rendering and exact-input recognition. */
export namespace CodexReviewMenu {
  /** Native question answer key. */
  export const QuestionId = "gdoc_review"
  /** Native question header. */
  export const Header = NativeReviewMenu.Header
  /** Canonical review choices. */
  export const Options = NativeReviewMenu.Options
  /** Unrelated or altered questions cannot produce review evidence. */
  export const QuestionSchema = NativeReviewMenu.QuestionSchema.extend({
    id: z.literal(QuestionId)
  }).strict()
  /** Creates the Codex question for this synchronized revision. */
  export function createQuestion(
    state: ReviewState,
    digest: string
  ): CodexReviewQuestion {
    return { id: QuestionId, ...NativeReviewMenu.createQuestion(state, digest) }
  }
  /** Checks the whole question independently of JSON key order. */
  export function matches(
    questions: unknown,
    state: ReviewState,
    digest: string
  ): boolean {
    if (!Array.isArray(questions) || questions.length !== 1) return false
    const parsed = QuestionSchema.safeParse(questions[0])
    return (
      parsed.success &&
      NativeReviewMenu.matchesContent(parsed.data, state, digest)
    )
  }
}
