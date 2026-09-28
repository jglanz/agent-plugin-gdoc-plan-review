import Assert from "node:assert"
import { homedir } from "node:os"
import path from "node:path"

import { GDocReview } from "../Constants.js"
import { CodexSupport } from "./CodexSupport.js"
import { HostKind, HostRuntime } from "./HostRuntime.js"

/** How a harness identifies the complete plan under review. */
export enum PlanBindingKind {
  transcript = "transcript",
  session = "session"
}

/** Capabilities are declared per adapter, never inferred from not being Claude. */
export interface HostCapabilities {
  /** Whether review writes have been verified within this harness's planning mode. */
  inPlanWritesVerified: boolean
  /** Whether this adapter implements the existing Claude permission-mode switch. */
  permissionModeSwitch: boolean
  /** Outstanding release prerequisite, or null. */
  blocker: string
  /** Explanation of the supported permission boundary, or null. */
  message: string
}

/** One implemented harness's storage and runtime contracts. */
export interface HostDefinition {
  /** Stable persisted identity. */
  host: HostKind
  /** Plan discovery method. */
  planBinding: PlanBindingKind
  /** Environment key overriding the state home. */
  stateHomeEnvironmentKey: string
  /** Default state home relative to the user's home directory. */
  defaultStateHomeSubpath: string
  /** Additional host directory below the state home. */
  stateBaseSubpath: string
  /** Installed plugin-root override supplied by the harness. */
  pluginRootEnvironmentKey: string
  /** Separate binding namespace even with a shared --state-dir. */
  sessionsSubpath: string
  /** Separate managed snapshot namespace, preserving existing Codex paths. */
  plansSubpath: string
  /** Harness-specific model instructions. */
  instructionsSubpath: string
  /** Honest support and permission status. */
  capabilities: HostCapabilities
}

/** The single registration table for implemented harnesses. */
export namespace HostRegistry {
  /** OpenCode honors the XDG state-home convention for plugin state. */
  export const OpenCodeStateHomeEnvironmentKey = "XDG_STATE_HOME"
  /** Optional root override for an OpenCode plugin loaded outside this checkout. */
  export const OpenCodeRootEnvironmentKey = "GDOC_REVIEW_PLUGIN_ROOT"
  /** Live host and Google validation is separate from the tested adapter contract. */
  export const OpenCodeBlocker = "live_review_validation_pending"
  /** OpenCode permissions remain under the native host's control. */
  export const OpenCodeMessage =
    "OpenCode review actions use native permissions. Only write the plan snapshot and Google Doc when the current agent authorizes those operations. Approval records the review; it never changes agent or permissions. Live Google review validation is pending."
  /** Definitions must be added deliberately with an adapter and contract tests. */
  export const Definitions: Readonly<Record<HostKind, HostDefinition>> = {
    [HostKind.claude]: {
      host: HostKind.claude,
      planBinding: PlanBindingKind.transcript,
      stateHomeEnvironmentKey: HostRuntime.ClaudeHomeEnvironmentKey,
      defaultStateHomeSubpath: HostRuntime.ClaudeDirectoryName,
      stateBaseSubpath: "",
      pluginRootEnvironmentKey: GDocReview.PluginRootEnvironmentKey,
      sessionsSubpath: "sessions",
      plansSubpath: "plans",
      instructionsSubpath: "skills/gdoc-review/SKILL.md",
      capabilities: {
        inPlanWritesVerified: true,
        permissionModeSwitch: true,
        blocker: null,
        message: null
      }
    },
    [HostKind.codex]: {
      host: HostKind.codex,
      planBinding: PlanBindingKind.session,
      stateHomeEnvironmentKey: HostRuntime.CodexHomeEnvironmentKey,
      defaultStateHomeSubpath: HostRuntime.CodexDirectoryName,
      stateBaseSubpath: "",
      pluginRootEnvironmentKey: HostRuntime.CodexRootEnvironmentKey,
      sessionsSubpath: "codex-sessions",
      plansSubpath: "plans",
      instructionsSubpath: "skills/gdoc-review/CODEX.md",
      capabilities: {
        inPlanWritesVerified: CodexSupport.InPlanWritesVerified,
        permissionModeSwitch: false,
        blocker: CodexSupport.Blocker,
        message: CodexSupport.Message
      }
    },
    [HostKind.opencode]: {
      host: HostKind.opencode,
      planBinding: PlanBindingKind.session,
      stateHomeEnvironmentKey: OpenCodeStateHomeEnvironmentKey,
      defaultStateHomeSubpath: ".local/state",
      stateBaseSubpath: "opencode",
      pluginRootEnvironmentKey: OpenCodeRootEnvironmentKey,
      sessionsSubpath: "opencode-sessions",
      plansSubpath: "opencode-plans",
      instructionsSubpath: "skills/gdoc-review/OPENCODE.md",
      capabilities: {
        inPlanWritesVerified: false,
        permissionModeSwitch: false,
        blocker: OpenCodeBlocker,
        message: OpenCodeMessage
      }
    }
  }
}

/** Resolves an implemented adapter; unknown harnesses never fall back to Claude. */
export function getHostDefinition(host: HostKind): HostDefinition {
  const definition = Object.hasOwn(HostRegistry.Definitions, host)
    ? HostRegistry.Definitions[host]
    : null
  Assert.ok(definition != null, `No review adapter is implemented for ${host}`)
  return definition
}

/** Resolves the host default without reading mutable CLI overrides. */
export function resolveHostStateDirectory(host: HostKind): string {
  const definition = getHostDefinition(host),
    configured = process.env[definition.stateHomeEnvironmentKey],
    stateHomePath = configured?.trim()
      ? configured
      : path.join(homedir(), definition.defaultStateHomeSubpath)
  return path.join(
    stateHomePath,
    definition.stateBaseSubpath,
    GDocReview.StateDirName
  )
}
