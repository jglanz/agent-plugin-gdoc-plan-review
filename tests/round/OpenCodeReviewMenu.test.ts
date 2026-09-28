import { NativeReviewMenu, OpenCodeReviewMenu } from "claude-gdoc-review-plugin"
import { createNativeTestEnvironment } from "../support/nativeReviewTestSupport.js"
import {
  destroyHookTestEnvironment,
  HookTestEnvironment
} from "../support/hookTestSupport.js"

const ChangedDigest = "changed-digest"

describe("OpenCode native question", () => {
  let environment: HookTestEnvironment = null
  beforeEach(async () => {
    environment = await createNativeTestEnvironment()
  })
  afterEach(async () => {
    await destroyHookTestEnvironment(environment)
  })

  it("renders a positional single-answer question with the shared review meaning", async () => {
    const state = await environment.store.load(environment.planSlug),
      digest = state.lastSync.planSha256,
      question = OpenCodeReviewMenu.createQuestion(state, digest)
    expect(question).toEqual({
      ...NativeReviewMenu.createQuestion(state, digest),
      multiple: false
    })
    expect(OpenCodeReviewMenu.matches([question], state, digest)).toBe(true)
    expect(
      OpenCodeReviewMenu.matches(
        [{ ...question, multiple: true }],
        state,
        digest
      )
    ).toBe(false)
    expect(OpenCodeReviewMenu.matches([question], state, ChangedDigest)).toBe(
      false
    )
    expect(
      OpenCodeReviewMenu.matches([question, question], state, digest)
    ).toBe(false)
    expect(OpenCodeReviewMenu.matches(null, state, digest)).toBe(false)
    expect(
      OpenCodeReviewMenu.matches([question], { ...state, doc: null }, digest)
    ).toBe(false)
  })
})
