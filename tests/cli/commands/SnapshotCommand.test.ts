import {
  CodexSessionStore,
  HostKind,
  SnapshotCommand
} from "claude-gdoc-review-plugin"

import { CodexTest } from "../../support/codexTestSupport.js"
import {
  CliTestEnvironment,
  createCliTestEnvironment,
  destroyCliTestEnvironment,
  runCli
} from "../../support/cliTestSupport.js"

describe("snapshot", () => {
  let environment: CliTestEnvironment = null
  beforeEach(async () => {
    environment = await createCliTestEnvironment()
  })
  afterEach(async () => {
    await destroyCliTestEnvironment(environment)
  })
  it("binds an existing complete plan without parsing a transcript", async () => {
    const result = await runCli(environment, [
      SnapshotCommand.Name,
      CodexTest.HostFlag,
      HostKind.codex,
      CodexTest.SessionFlag,
      CodexTest.OtherSessionId,
      CodexTest.PlanFlag,
      environment.planFile
    ])
    expect(result.exitCode).toBe(0)
    const session = await new CodexSessionStore(environment.statePath).read(
      CodexTest.OtherSessionId
    )
    expect(session.planFile).toBe(environment.planFile)
    expect(session.pendingQuestion).toBeNull()
  })
  it("rejects Claude, missing plan input, and unsafe session identifiers", async () => {
    const base = [
      SnapshotCommand.Name,
      CodexTest.SessionFlag,
      CodexTest.OtherSessionId
    ]
    expect((await runCli(environment, base)).exitCode).not.toBe(0)
    expect(
      (await runCli(environment, [...base, CodexTest.HostFlag, HostKind.codex]))
        .exitCode
    ).not.toBe(0)
    expect(
      (
        await runCli(environment, [
          SnapshotCommand.Name,
          CodexTest.HostFlag,
          HostKind.codex,
          CodexTest.SessionFlag,
          environment.planFile,
          CodexTest.PlanFlag,
          environment.planFile
        ])
      ).exitCode
    ).not.toBe(0)
  })
})
