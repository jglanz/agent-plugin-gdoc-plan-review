import { z } from "zod"

import { renderSafeDocumentUrl } from "../google/index.js"
import { ReviewState } from "../state/index.js"

/** Review approval never changes native host permissions. */
export enum NativeReviewLabel {
  approve = "Approve reviewed plan",
  check = "Check Doc again",
  revise = "Revise plan"
}

/** A native single-choice option. */
export interface NativeReviewOption {
  /** Visible user answer. */
  label: NativeReviewLabel
  /** Consequence presented before selecting the option. */
  description: string
}

/** Shared question content; adapters add their own wire-format fields. */
export interface NativeReviewQuestion {
  /** Concise native header. */
  header: string
  /** Document, revision, and digest offered for approval. */
  question: string
  /** Approval, feedback refresh, and revision choices. */
  options: readonly NativeReviewOption[]
}

/** Canonical review meaning shared across native question adapters. */
export namespace NativeReviewMenu {
  /** Header supported by all current native question tools. */
  export const Header = "GDoc Review"
  /** Explicit choices; the native host supplies free text. */
  export const Options: readonly NativeReviewOption[] = [
    {
      label: NativeReviewLabel.approve,
      description:
        "Approve this reviewed revision; keep native mode and permissions unchanged."
    },
    {
      label: NativeReviewLabel.check,
      description:
        "Read new comments, revise the plan, and sync another review round."
    },
    {
      label: NativeReviewLabel.revise,
      description: "Specify changes to the plan before approving it."
    }
  ]
  /** Shared content schema before host-specific additions. */
  export const QuestionSchema = z.object({
    header: z.literal(Header),
    question: z.string(),
    options: z.array(z.object({ label: z.string(), description: z.string() }))
  })
  /** Binds the question text to the exact synchronized plan revision. */
  export function createQuestion(
    state: ReviewState,
    digest: string
  ): NativeReviewQuestion {
    return {
      header: Header,
      question: `Review revision ${state.revision}: ${renderSafeDocumentUrl(state.doc.id)}\nPlan SHA-256: ${digest}\nWhat should happen next?`,
      options: Options
    }
  }
  /** Recognizes the exact shared content after host-specific schema validation. */
  export function matchesContent(
    question: z.infer<typeof QuestionSchema>,
    state: ReviewState,
    digest: string
  ): boolean {
    if (state.doc == null) return false
    const expected = createQuestion(state, digest)
    return (
      question.header === expected.header &&
      question.question === expected.question &&
      question.options.length === Options.length &&
      question.options.every(
        (option, index) =>
          option.label === Options[index].label &&
          option.description === Options[index].description
      )
    )
  }
}
