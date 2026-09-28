import { OpenCodeToolNames, WorkspaceToolName } from "claude-gdoc-review-plugin"

const Server = "gworkspace-personal"
const CollidingServers = ["workspace.personal", "workspace_personal"]
const UnrelatedTool = "bash"

describe("OpenCode tool names", () => {
  it("maps a configured server's tool into the shared recorder format", () => {
    const name = `${Server}${OpenCodeToolNames.Separator}${WorkspaceToolName.update_drive_file}`
    expect(OpenCodeToolNames.parse(name, [Server])).toEqual({
      serverName: Server,
      tool: WorkspaceToolName.update_drive_file
    })
    expect(OpenCodeToolNames.normalize(name, [Server])).toBe(
      `${WorkspaceToolName.Prefix}${Server}${WorkspaceToolName.Separator}${WorkspaceToolName.update_drive_file}`
    )
    expect(OpenCodeToolNames.normalize(name, [])).toBeNull()
  })
  it("rejects unknown tools and ambiguous sanitized server names", () => {
    expect(OpenCodeToolNames.parse(UnrelatedTool, [Server])).toBeNull()
    const name = `${CollidingServers[1]}${OpenCodeToolNames.Separator}${WorkspaceToolName.update_drive_file}`
    expect(OpenCodeToolNames.parse(name, CollidingServers)).toBeNull()
    expect(
      OpenCodeToolNames.parse(name, [CollidingServers[0]])?.serverName
    ).toBe(CollidingServers[0])
  })
})
