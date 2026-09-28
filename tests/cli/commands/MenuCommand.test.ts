import {
  getNativeReviewProtocol,
  HostKind,
  MenuCommand
} from "claude-gdoc-review-plugin"

import {
  NativeTest,
  createNativeTestEnvironment
} from "../../support/nativeReviewTestSupport.js"
import { runCli } from "../../support/cliTestSupport.js"
import {
  destroyHookTestEnvironment,
  HookTestEnvironment,
  writePlanText
} from "../../support/hookTestSupport.js"

describe.each([HostKind.codex, HostKind.opencode])("%s menu", host => {
  let environment: HookTestEnvironment = null
  beforeEach(async () => {
    environment = await createNativeTestEnvironment(host)
  })
  afterEach(async () => {
    await destroyHookTestEnvironment(environment)
  })
  it("renders a canonical synchronized question and rejects a later stale plan", async () => {
    const argumentsList = [
        MenuCommand.Name,
        NativeTest.HostFlag,
        host,
        NativeTest.PlanFlag,
        environment.planFile
      ],
      result = await runCli(environment, argumentsList),
      state = await environment.store.load(environment.planSlug)
    expect(
      getNativeReviewProtocol(host).matches(
        JSON.parse(result.stdout).questions,
        state,
        state.lastSync.planSha256
      )
    ).toBe(true)
    await writePlanText(environment, NativeTest.RevisedPlan)
    expect((await runCli(environment, argumentsList)).exitCode).not.toBe(0)
    expect(
      (
        await runCli(environment, [
          MenuCommand.Name,
          NativeTest.PlanFlag,
          environment.planFile
        ])
      ).exitCode
    ).not.toBe(0)
  })
})
