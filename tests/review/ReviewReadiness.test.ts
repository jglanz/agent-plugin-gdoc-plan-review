import {
  evaluateReview,
  isDecisionUsable,
  ReviewApproval,
  ReviewDecisionChoice,
  ReviewDecisionSource,
  ReviewReadiness,
  ReviewStateCodec,
  ReviewState,
  ReviewStatus,
  HostKind
} from "claude-gdoc-review-plugin"

import { createNativeTestEnvironment } from "../support/nativeReviewTestSupport.js"
import {
  destroyHookTestEnvironment,
  FixtureNow,
  HookTestEnvironment
} from "../support/hookTestSupport.js"

describe("shared review readiness", () => {
  let environment: HookTestEnvironment = null
  beforeEach(async () => {
    environment = await createNativeTestEnvironment()
  })
  afterEach(async () => {
    await destroyHookTestEnvironment(environment)
  })
  it("evaluates setup, unsynced, pending, approved, and closed states", async () => {
    const state = await environment.store.load(environment.planSlug),
      digest = state.lastSync.planSha256
    expect(
      evaluateReview(
        { ...state, status: ReviewStatus.setup },
        digest,
        FixtureNow
      )
    ).toBe(ReviewReadiness.setup)
    expect(evaluateReview({ ...state, doc: null }, digest, FixtureNow)).toBe(
      ReviewReadiness.setup
    )
    expect(evaluateReview(state, null, FixtureNow)).toBe(ReviewReadiness.sync)
    expect(evaluateReview(state, digest, FixtureNow)).toBe(ReviewReadiness.menu)
    const decision = {
      choice: ReviewDecisionChoice.approve_review,
      label: ReviewDecisionChoice.approve_review,
      text: null,
      planSha256: digest,
      at: FixtureNow.toISOString(),
      source: ReviewDecisionSource.request_user_input,
      toolUseId: null,
      consumedAt: null
    }
    expect(evaluateReview({ ...state, decision }, digest, FixtureNow)).toBe(
      ReviewReadiness.approved
    )
    expect(
      evaluateReview(
        {
          ...state,
          decision: { ...decision, choice: ReviewDecisionChoice.check_doc }
        },
        digest,
        FixtureNow
      )
    ).toBe(ReviewReadiness.check_doc)
    expect(
      evaluateReview(
        {
          ...state,
          decision: { ...decision, choice: ReviewDecisionChoice.other }
        },
        digest,
        FixtureNow
      )
    ).toBe(ReviewReadiness.revise)
    expect(
      evaluateReview(
        { ...state, status: ReviewStatus.cancelled },
        digest,
        FixtureNow
      )
    ).toBe(ReviewReadiness.inactive)
    expect(
      isDecisionUsable(
        decision,
        new Date(FixtureNow.getTime() + ReviewApproval.MaxDecisionAgeMs)
      )
    ).toBe(false)
    expect(
      isDecisionUsable(
        { ...decision, consumedAt: FixtureNow.toISOString() },
        FixtureNow
      )
    ).toBe(false)
    expect(isDecisionUsable(null, FixtureNow)).toBe(false)
  })

  it("migrates legacy Claude state and rejects unknown versions", async () => {
    const {
        host: _host,
        ownerSessionId: _owner,
        ...state
      } = await environment.store.load(environment.planSlug),
      migrated = ReviewStateCodec.assertValid(
        { ...state, version: ReviewState.LegacyVersion },
        ReviewStateCodec.TextSourceName
      )
    expect(migrated.host).toBe(HostKind.claude)
    expect(migrated.ownerSessionId).toBeNull()
    expect(migrated.version).toBe(ReviewState.Version)
    expect(migrated.lastSync).toEqual(state.lastSync)
    expect(() =>
      ReviewStateCodec.assertValid(
        { ...state, version: ReviewState.Version + 1 },
        ReviewStateCodec.TextSourceName
      )
    ).toThrow()
  })
})
