import {
  CapabilitiesCommand,
  CodexSupport,
  HostRegistry,
  HostKind
} from "claude-gdoc-review-plugin"

import { NativeTest } from "../../support/nativeReviewTestSupport.js"
import {
  CliTestEnvironment,
  createCliTestEnvironment,
  destroyCliTestEnvironment,
  runCli
} from "../../support/cliTestSupport.js"

describe("capabilities", () => {
  let environment: CliTestEnvironment = null
  beforeEach(async () => {
    environment = await createCliTestEnvironment()
  })
  afterEach(async () => {
    await destroyCliTestEnvironment(environment)
  })
  it("reports OpenCode's native permission boundary and pending live validation", async () => {
    const result = await runCli(environment, [
      CapabilitiesCommand.Name,
      NativeTest.HostFlag,
      HostKind.opencode
    ])
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      host: HostKind.opencode,
      inPlanWritesVerified: false,
      permissionModeSwitch: false,
      blocker: HostRegistry.OpenCodeBlocker
    })
  })
  it("reports the Codex release blocker and the existing Claude behavior", async () => {
    const codex = await runCli(environment, [
        CapabilitiesCommand.Name,
        NativeTest.HostFlag,
        HostKind.codex
      ]),
      claude = await runCli(environment, [CapabilitiesCommand.Name])
    expect(JSON.parse(codex.stdout)).toMatchObject({
      inPlanWritesVerified: false,
      permissionModeSwitch: false,
      blocker: CodexSupport.Blocker
    })
    expect(JSON.parse(claude.stdout)).toMatchObject({
      inPlanWritesVerified: true,
      permissionModeSwitch: true,
      blocker: null
    })
    expect(
      (
        await runCli(environment, [
          CapabilitiesCommand.Name,
          NativeTest.HostFlag,
          NativeTest.OtherServer
        ])
      ).exitCode
    ).not.toBe(0)
  })
})
