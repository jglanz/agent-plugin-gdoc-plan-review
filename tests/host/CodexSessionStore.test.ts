import { writeFile } from "node:fs/promises"

import { CodexSessionStore, FsUtils } from "claude-gdoc-review-plugin"

import {
  CodexTest,
  createCodexTestEnvironment
} from "../support/codexTestSupport.js"
import {
  destroyHookTestEnvironment,
  HookTestEnvironment
} from "../support/hookTestSupport.js"

describe("CodexSessionStore", () => {
  let environment: HookTestEnvironment = null
  beforeEach(async () => {
    environment = await createCodexTestEnvironment()
  })
  afterEach(async () => {
    await destroyHookTestEnvironment(environment)
  })

  it("round-trips a binding and refuses silent rebinding", async () => {
    const store = new CodexSessionStore(environment.statePath)
    expect((await store.read(environment.sessionId)).planFile).toBe(
      environment.planFile
    )
    await expect(
      store.bind(environment.sessionId, environment.transcriptPath)
    ).rejects.toThrow()
    expect(await store.read(CodexTest.OtherSessionId)).toBeNull()
  })

  it("fails for a corrupt record and a traversal session id", async () => {
    const store = new CodexSessionStore(environment.statePath)
    await writeFile(
      store.sessionFile(environment.sessionId),
      CodexTest.Plan,
      FsUtils.Encoding
    )
    await expect(store.read(environment.sessionId)).rejects.toThrow()
    expect(() => store.sessionFile(environment.planFile)).toThrow()
  })

  it("rejects concurrent operations and releases locks after failures", async () => {
    const store = new CodexSessionStore(environment.statePath)
    await store.withLock(environment.sessionId, async () => {
      await expect(
        store.withLock(environment.sessionId, async () => true)
      ).rejects.toThrow()
    })
    await expect(
      store.withLock(environment.sessionId, async () => {
        throw new Error(CodexTest.Plan)
      })
    ).rejects.toThrow()
    expect(await store.withLock(environment.sessionId, async () => true)).toBe(
      true
    )
  })
})
