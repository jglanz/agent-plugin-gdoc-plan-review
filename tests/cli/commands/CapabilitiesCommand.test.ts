import {
  CapabilitiesCommand,
  CodexSupport,
  HostKind
} from "claude-gdoc-review-plugin"

import { CodexTest } from "../../support/codexTestSupport.js"
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
  it("reports the Codex release blocker and the existing Claude behavior", async () => {
    const codex = await runCli(environment, [
        CapabilitiesCommand.Name,
        CodexTest.HostFlag,
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
          CodexTest.HostFlag,
          CodexTest.OtherServer
        ])
      ).exitCode
    ).not.toBe(0)
  })
})
