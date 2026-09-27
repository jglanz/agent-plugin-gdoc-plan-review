/** Hosts with separate hook protocols and state directories. */
export enum HostKind {
  claude = "claude",
  codex = "codex"
}

/** Host-specific identities and environment contracts. */
export namespace HostRuntime {
  /** Global CLI option; hooks always set it explicitly. */
  export const HostOption = "host"
  /** Codex's configuration-directory override. */
  export const CodexHomeEnvironmentKey = "CODEX_HOME"
  /** Default Codex configuration directory. */
  export const CodexDirectoryName = ".codex"
  /** Codex's installed plugin root, independent of compatibility variables. */
  export const CodexRootEnvironmentKey = "PLUGIN_ROOT"
  /** Codex marketplace identity; the existing Claude identity is preserved. */
  export const CodexPluginName = "gdoc-plan-review-plugin"
}

let activeHost = HostKind.claude

/** Selects the host for this CLI invocation and its late-bound loggers. */
export function setActiveHost(host: HostKind): void {
  activeHost = host
}

/** Returns the explicitly selected host; legacy invocations use Claude. */
export function getActiveHost(): HostKind {
  return activeHost
}
