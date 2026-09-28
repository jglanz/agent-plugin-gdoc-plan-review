import {
  ReviewSessionStore,
  HostKind,
  SnapshotCommand
} from "claude-gdoc-review-plugin"

import { NativeTest } from "../../support/nativeReviewTestSupport.js"
import {
  CliTestEnvironment,
  createCliTestEnvironment,
  destroyCliTestEnvironment,
  runCli
} from "../../support/cliTestSupport.js"

describe.each([HostKind.codex, HostKind.opencode])("%s snapshot", host => {
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
      NativeTest.HostFlag,
      host,
      NativeTest.SessionFlag,
      NativeTest.OtherSessionId,
      NativeTest.PlanFlag,
      environment.planFile
    ])
    expect(result.exitCode).toBe(0)
    const session = await new ReviewSessionStore(
      environment.statePath,
      host
    ).read(NativeTest.OtherSessionId)
    expect(session.planFile).toBe(environment.planFile)
    expect(session.pendingQuestion).toBeNull()
  })
  it("rejects Claude, missing plan input, and unsafe session identifiers", async () => {
    const base = [
      SnapshotCommand.Name,
      NativeTest.SessionFlag,
      NativeTest.OtherSessionId
    ]
    expect((await runCli(environment, base)).exitCode).not.toBe(0)
    expect(
      (await runCli(environment, [...base, NativeTest.HostFlag, host])).exitCode
    ).not.toBe(0)
    expect(
      (
        await runCli(environment, [
          SnapshotCommand.Name,
          NativeTest.HostFlag,
          host,
          NativeTest.SessionFlag,
          environment.planFile,
          NativeTest.PlanFlag,
          environment.planFile
        ])
      ).exitCode
    ).not.toBe(0)
  })
})
