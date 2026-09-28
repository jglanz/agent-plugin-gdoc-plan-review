import { writeFile } from "node:fs/promises"

import {
  ReviewSessionStore,
  FsUtils,
  HostKind
} from "claude-gdoc-review-plugin"

import {
  NativeTest,
  createNativeTestEnvironment
} from "../support/nativeReviewTestSupport.js"
import {
  destroyHookTestEnvironment,
  HookTestEnvironment
} from "../support/hookTestSupport.js"

describe("ReviewSessionStore", () => {
  let environment: HookTestEnvironment = null
  beforeEach(async () => {
    environment = await createNativeTestEnvironment()
  })
  afterEach(async () => {
    await destroyHookTestEnvironment(environment)
  })

  it("round-trips a binding and refuses silent rebinding", async () => {
    const store = new ReviewSessionStore(environment.statePath, HostKind.codex)
    expect((await store.read(environment.sessionId)).planFile).toBe(
      environment.planFile
    )
    await expect(
      store.bind(environment.sessionId, environment.transcriptPath)
    ).rejects.toThrow()
    expect(await store.read(NativeTest.OtherSessionId)).toBeNull()
  })

  it("isolates identical native session ids across harnesses", async () => {
    const codex = new ReviewSessionStore(environment.statePath, HostKind.codex),
      openCode = new ReviewSessionStore(
        environment.statePath,
        HostKind.opencode
      )
    await openCode.bind(environment.sessionId, environment.transcriptPath)
    expect((await codex.read(environment.sessionId)).planFile).toBe(
      environment.planFile
    )
    expect((await openCode.read(environment.sessionId)).planFile).toBe(
      environment.transcriptPath
    )
    expect(
      () => new ReviewSessionStore(environment.statePath, HostKind.claude)
    ).toThrow()
  })

  it("fails for a corrupt record and a traversal session id", async () => {
    const store = new ReviewSessionStore(environment.statePath, HostKind.codex)
    await writeFile(
      store.sessionFile(environment.sessionId),
      NativeTest.Plan,
      FsUtils.Encoding
    )
    await expect(store.read(environment.sessionId)).rejects.toThrow()
    expect(() => store.sessionFile(environment.planFile)).toThrow()
  })

  it("rejects concurrent operations and releases locks after failures", async () => {
    const store = new ReviewSessionStore(environment.statePath, HostKind.codex)
    await store.withLock(environment.sessionId, async () => {
      await expect(
        store.withLock(environment.sessionId, async () => true)
      ).rejects.toThrow()
    })
    await expect(
      store.withLock(environment.sessionId, async () => {
        throw new Error(NativeTest.Plan)
      })
    ).rejects.toThrow()
    expect(await store.withLock(environment.sessionId, async () => true)).toBe(
      true
    )
  })
})
