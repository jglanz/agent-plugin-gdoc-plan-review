import { homedir } from "node:os"
import path from "node:path"

import {
  getActiveHost,
  GDocReview,
  HostKind,
  HostRuntime,
  PluginConfig,
  resetCliState,
  resolvePluginRoot,
  resolveStateDirectory,
  setActiveHost,
  setActiveStateDirectory
} from "claude-gdoc-review-plugin"

import { PluginRootPath } from "../support/processTestSupport.js"

describe("HostRuntime", () => {
  const originalEnvironment = { ...process.env }
  afterEach(() => {
    process.env = { ...originalEnvironment }
    resetCliState()
  })
  it("defaults to Claude and isolates the Codex state root", () => {
    expect(getActiveHost()).toBe(HostKind.claude)
    expect(resolveStateDirectory()).toBe(
      path.join(
        process.env[PluginConfig.ConfigDirectoryEnvironmentKey],
        GDocReview.StateDirName
      )
    )
    setActiveHost(HostKind.codex)
    expect(resolveStateDirectory()).toBe(
      path.join(
        process.env[HostRuntime.CodexHomeEnvironmentKey],
        GDocReview.StateDirName
      )
    )
    delete process.env[HostRuntime.CodexHomeEnvironmentKey]
    expect(resolveStateDirectory()).toBe(
      path.join(
        homedir(),
        HostRuntime.CodexDirectoryName,
        GDocReview.StateDirName
      )
    )
    setActiveStateDirectory(PluginRootPath)
    expect(resolveStateDirectory()).toBe(PluginRootPath)
  })
  it("selects the Codex root independently of the Claude compatibility variable", () => {
    setActiveHost(HostKind.codex)
    process.env[HostRuntime.CodexRootEnvironmentKey] = PluginRootPath
    process.env[GDocReview.PluginRootEnvironmentKey] = homedir()
    expect(resolvePluginRoot()).toBe(PluginRootPath)
    delete process.env[HostRuntime.CodexRootEnvironmentKey]
    expect(resolvePluginRoot()).toBe(PluginRootPath)
  })
  it("resolves an explicit host without changing the active CLI host", () => {
    setActiveHost(HostKind.claude)
    process.env[HostRuntime.CodexRootEnvironmentKey] = PluginRootPath
    expect(resolvePluginRoot(HostKind.codex)).toBe(PluginRootPath)
    expect(resolveStateDirectory(HostKind.codex)).toBe(
      path.join(
        process.env[HostRuntime.CodexHomeEnvironmentKey],
        GDocReview.StateDirName
      )
    )
    expect(getActiveHost()).toBe(HostKind.claude)
  })
})
