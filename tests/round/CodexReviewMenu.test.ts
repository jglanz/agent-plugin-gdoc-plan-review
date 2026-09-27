import { CodexReviewMenu } from "claude-gdoc-review-plugin"

import { createCodexTestEnvironment } from "../support/codexTestSupport.js"
import {
  destroyHookTestEnvironment,
  HookTestEnvironment
} from "../support/hookTestSupport.js"

describe("CodexReviewMenu", () => {
  let environment: HookTestEnvironment = null
  beforeEach(async () => {
    environment = await createCodexTestEnvironment()
  })
  afterEach(async () => {
    await destroyHookTestEnvironment(environment)
  })
  it("matches the canonical question with a Doc, revision, and digest", async () => {
    const state = await environment.store.load(environment.planSlug),
      digest = state.lastSync.planSha256,
      question = CodexReviewMenu.createQuestion(state, digest)
    expect(CodexReviewMenu.matches([question], state, digest)).toBe(true)
    expect(
      CodexReviewMenu.matches(
        [{ ...question, options: [...question.options].reverse() }],
        state,
        digest
      )
    ).toBe(false)
    expect(CodexReviewMenu.matches([], state, digest)).toBe(false)
    expect(CodexReviewMenu.matches([question, question], state, digest)).toBe(
      false
    )
    expect(
      CodexReviewMenu.matches([question], { ...state, doc: null }, digest)
    ).toBe(false)
  })
})
