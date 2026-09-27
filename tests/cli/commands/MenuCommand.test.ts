import {
  CodexReviewMenu,
  HostKind,
  MenuCommand
} from "claude-gdoc-review-plugin"

import {
  CodexTest,
  createCodexTestEnvironment
} from "../../support/codexTestSupport.js"
import { runCli } from "../../support/cliTestSupport.js"
import {
  destroyHookTestEnvironment,
  HookTestEnvironment,
  writePlanText
} from "../../support/hookTestSupport.js"

describe("menu", () => {
  let environment: HookTestEnvironment = null
  beforeEach(async () => {
    environment = await createCodexTestEnvironment()
  })
  afterEach(async () => {
    await destroyHookTestEnvironment(environment)
  })
  it("renders a canonical synchronized question and rejects a later stale plan", async () => {
    const argumentsList = [
        MenuCommand.Name,
        CodexTest.HostFlag,
        HostKind.codex,
        CodexTest.PlanFlag,
        environment.planFile
      ],
      result = await runCli(environment, argumentsList),
      state = await environment.store.load(environment.planSlug)
    expect(
      CodexReviewMenu.matches(
        JSON.parse(result.stdout).questions,
        state,
        state.lastSync.planSha256
      )
    ).toBe(true)
    await writePlanText(environment, CodexTest.RevisedPlan)
    expect((await runCli(environment, argumentsList)).exitCode).not.toBe(0)
    expect(
      (
        await runCli(environment, [
          MenuCommand.Name,
          CodexTest.PlanFlag,
          environment.planFile
        ])
      ).exitCode
    ).not.toBe(0)
  })
})
