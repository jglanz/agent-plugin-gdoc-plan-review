import { z } from "zod"

import { renderSafeDocumentUrl } from "../google/index.js"
import { ReviewState } from "../state/index.js"

/** Native Codex choices; approval never changes host permissions. */
export enum CodexReviewLabel {
  approve = "Approve reviewed plan",
  check = "Check Doc again",
  revise = "Revise plan"
}

/** A native question option. */
export interface CodexReviewOption {
  /** Visible answer. */
  label: CodexReviewLabel
  /** Consequence shown to the user. */
  description: string
}

/** A single request_user_input question. */
export interface CodexReviewQuestion {
  /** Stable response key. */
  id: string
  /** Short native header. */
  header: string
  /** Document, revision, and digest being reviewed. */
  question: string
  /** Three native options; free text is provided by the host. */
  options: readonly CodexReviewOption[]
}

/** Canonical rendering and recognition of the Codex review question. */
export namespace CodexReviewMenu {
  /** Native question answer key. */
  export const QuestionId = "gdoc_review"
  /** Native question header. */
  export const Header = "GDoc Review"
  /** The complete supported native option set. */
  export const Options: readonly CodexReviewOption[] = [
    {
      label: CodexReviewLabel.approve,
      description:
        "Approve this reviewed revision; keep native mode and permissions unchanged."
    },
    {
      label: CodexReviewLabel.check,
      description:
        "Read new comments, revise the plan, and sync another review round."
    },
    {
      label: CodexReviewLabel.revise,
      description: "Specify changes to the plan before approving it."
    }
  ]
  /** Native input schema; unrelated questions cannot produce review evidence. */
  export const QuestionSchema = z
    .object({
      id: z.literal(QuestionId),
      header: z.literal(Header),
      question: z.string(),
      options: z.array(z.object({ label: z.string(), description: z.string() }))
    })
    .strict()

  /** Creates the question for a concrete synchronized revision. */
  export function createQuestion(
    state: ReviewState,
    digest: string
  ): CodexReviewQuestion {
    return {
      id: QuestionId,
      header: Header,
      question: `Review revision ${state.revision}: ${renderSafeDocumentUrl(state.doc.id)}\nPlan SHA-256: ${digest}\nWhat should happen next?`,
      options: Options
    }
  }

  /** Checks the whole question, independent of JSON object key order. */
  export function matches(
    questions: unknown,
    state: ReviewState,
    digest: string
  ): boolean {
    if (
      !Array.isArray(questions) ||
      questions.length !== 1 ||
      state.doc == null
    )
      return false
    const parsed = QuestionSchema.safeParse(questions[0]),
      expected = createQuestion(state, digest)
    return (
      parsed.success &&
      parsed.data.question === expected.question &&
      parsed.data.options.length === Options.length &&
      parsed.data.options.every(
        (option, index) =>
          option.label === Options[index].label &&
          option.description === Options[index].description
      )
    )
  }
}
