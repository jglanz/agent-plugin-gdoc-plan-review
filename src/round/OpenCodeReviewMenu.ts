import { z } from "zod"

import { ReviewState } from "../state/index.js"
import { NativeReviewMenu, NativeReviewQuestion } from "./NativeReviewMenu.js"

/** OpenCode's native question payload has positional answers and no question id. */
export interface OpenCodeReviewQuestion extends NativeReviewQuestion {
  /** Multi-select approval is forbidden. */
  multiple: boolean
}

/** Formatting and recognition of OpenCode's question tool contract. */
export namespace OpenCodeReviewMenu {
  /** Native tool input schema from OpenCode 1.18.32; custom text is host-provided. */
  export const QuestionSchema = NativeReviewMenu.QuestionSchema.extend({
    multiple: z.literal(false).optional()
  }).strict()

  /** Produces a native single-choice question for this synchronized revision. */
  export function createQuestion(
    state: ReviewState,
    digest: string
  ): OpenCodeReviewQuestion {
    return {
      ...NativeReviewMenu.createQuestion(state, digest),
      multiple: false
    }
  }

  /** Validates the complete OpenCode question before capturing approval evidence. */
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
