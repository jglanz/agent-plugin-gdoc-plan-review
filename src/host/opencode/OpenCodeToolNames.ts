import { WorkspaceToolName, WorkspaceToolRef } from "../../google/index.js"

/** OpenCode's server_tool naming, pinned to the 1.18.32 MCP catalog. */
export namespace OpenCodeToolNames {
  /** Host sanitization for server and tool names. */
  export const UnsafeCharacters = /[^a-zA-Z0-9_-]/g
  /** Host replacement and separator. */
  export const Separator = "_"

  /** Resolves against configured servers, rejecting sanitization collisions. */
  export function parse(
    name: string,
    servers: readonly string[]
  ): WorkspaceToolRef {
    const references = servers.flatMap(serverName =>
      WorkspaceToolName.All.filter(
        tool =>
          name ===
          `${serverName.replace(UnsafeCharacters, Separator)}${Separator}${tool}`
      ).map(tool => ({ serverName, tool }))
    )
    return references.length === 1 ? references[0] : null
  }

  /** Converts a native name to the shared recorder's internal wire name. */
  export function normalize(name: string, servers: readonly string[]): string {
    const reference = parse(name, servers)
    return reference == null
      ? null
      : `${WorkspaceToolName.Prefix}${reference.serverName}${WorkspaceToolName.Separator}${reference.tool}`
  }
}
