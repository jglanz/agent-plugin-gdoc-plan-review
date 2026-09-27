import {
  ReviewDecision,
  ReviewDecisionChoice,
  ReviewState,
  ReviewStatus
} from "../state/index.js"
import { isNonEmptyString } from "../utils/index.js"

/** Host-independent next step for a review. */
export enum ReviewReadiness {
  inactive = "inactive",
  setup = "setup",
  sync = "sync",
  menu = "menu",
  check_doc = "check_doc",
  revise = "revise",
  approved = "approved"
}

/** Shared approval freshness contract. */
export namespace ReviewApproval {
  /** Maximum lifetime of an unconsumed answer: thirty minutes. */
  export const MaxDecisionAgeMs = 1_800_000
}

/** Rejects consumed, expired, invalid, and future-dated menu answers. */
export function isDecisionUsable(decision: ReviewDecision, now: Date): boolean {
  if (decision == null || decision.consumedAt != null) return false
  const ageMs = now.getTime() - Date.parse(decision.at)
  return (
    Number.isFinite(ageMs) &&
    ageMs >= 0 &&
    ageMs < ReviewApproval.MaxDecisionAgeMs
  )
}

/** Evaluates the persisted review against the current complete plan digest. */
export function evaluateReview(
  state: ReviewState,
  digest: string,
  now: Date
): ReviewReadiness {
  if (state.status === ReviewStatus.setup) return ReviewReadiness.setup
  if (state.status !== ReviewStatus.active) return ReviewReadiness.inactive
  if (state.doc == null) return ReviewReadiness.setup
  if (
    !isNonEmptyString(digest) ||
    state.lastSync == null ||
    state.lastSync.planSha256 !== digest
  )
    return ReviewReadiness.sync
  const { decision } = state
  if (!isDecisionUsable(decision, now) || decision.planSha256 !== digest)
    return ReviewReadiness.menu
  if (decision.choice === ReviewDecisionChoice.check_doc)
    return ReviewReadiness.check_doc
  if (decision.choice === ReviewDecisionChoice.other)
    return ReviewReadiness.revise
  return ReviewReadiness.approved
}
