import { homedir } from "node:os"
import path from "node:path"

import {
  getHostDefinition,
  getNativeReviewProtocol,
  HostKind,
  HostRegistry,
  PlanBindingKind,
  resolveHostStateDirectory
} from "claude-gdoc-review-plugin"

const UnsupportedHosts = ["cursor", "junie", "toString", "__proto__"]
const StateHome = "/tmp/gdoc-host-state"
const StateSubpath = "gdoc-review"

describe("host registry", () => {
  const originalEnvironment = { ...process.env }
  afterEach(() => {
    process.env = { ...originalEnvironment }
  })

  it.each(Object.values(HostKind))(
    "declares the implemented %s adapter explicitly",
    host => {
      const definition = getHostDefinition(host)
      expect(definition.host).toBe(host)
      process.env[definition.stateHomeEnvironmentKey] = StateHome
      expect(resolveHostStateDirectory(host)).toBe(
        path.join(StateHome, definition.stateBaseSubpath, StateSubpath)
      )
      delete process.env[definition.stateHomeEnvironmentKey]
      expect(resolveHostStateDirectory(host)).toBe(
        path.join(
          homedir(),
          definition.defaultStateHomeSubpath,
          definition.stateBaseSubpath,
          StateSubpath
        )
      )
      if (definition.planBinding === PlanBindingKind.session) {
        expect(getNativeReviewProtocol(host).toolName).toBeTruthy()
        expect(definition.capabilities.permissionModeSwitch).toBe(false)
      }
    }
  )

  it.each(UnsupportedHosts)(
    "rejects unsupported harness %s without inherited-object fallback",
    unsupportedHost => {
      expect(() => getHostDefinition(unsupportedHost as HostKind)).toThrow()
      expect(() =>
        getNativeReviewProtocol(unsupportedHost as HostKind)
      ).toThrow()
      expect(() => getNativeReviewProtocol(HostKind.claude)).toThrow()
      expect(Object.keys(HostRegistry.Definitions)).not.toContain(
        unsupportedHost
      )
    }
  )

  it("gives OpenCode independent storage and an honest live validation status", () => {
    const codex = getHostDefinition(HostKind.codex),
      openCode = getHostDefinition(HostKind.opencode)
    expect(openCode.sessionsSubpath).not.toBe(codex.sessionsSubpath)
    expect(openCode.plansSubpath).not.toBe(codex.plansSubpath)
    expect(openCode.capabilities.blocker).toBe(HostRegistry.OpenCodeBlocker)
    expect(openCode.capabilities.inPlanWritesVerified).toBe(false)
  })
})
