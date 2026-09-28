import Assert from "node:assert/strict"
import { cp, mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const RootPath =
  process.argv[2] ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const BundleFile = "dist/opencode.mjs"
const InstructionsFile = "skills/gdoc-review/OPENCODE.md"
const Resources = ["dist", "skills"]
const TemporaryPrefix = "gdoc-opencode-package-"
const RootEnvironmentKey = "GDOC_REVIEW_PLUGIN_ROOT"
const OriginalRootOverride = process.env[RootEnvironmentKey]
const StateSubpath = "state"
const PluginExport = "GDocReviewOpenCode"
const ContextTool = "gdoc_review_context"
const Command = "gdoc-review"
const Session = "package-validation-session"
const PlanAgent = "plan"
const Host = "opencode"
const ExpectedHooks = [
  "config",
  "tool",
  "chat.params",
  "tool.execute.before",
  "tool.execute.after",
  "experimental.chat.system.transform",
  "experimental.session.compacting",
  "event",
  "dispose"
]

for (const file of [BundleFile, InstructionsFile])
  Assert.ok((await stat(path.join(RootPath, file))).isFile())
const isolatedRoot = await mkdtemp(path.join(tmpdir(), TemporaryPrefix))
try {
  delete process.env[RootEnvironmentKey]
  for (const resource of Resources)
    await cp(path.join(RootPath, resource), path.join(isolatedRoot, resource), {
      recursive: true
    })
  const plugin = await import(
    pathToFileURL(path.join(isolatedRoot, BundleFile)).href
  )
  Assert.deepEqual(Object.keys(plugin), [PluginExport])
  const stateDirectory = path.join(isolatedRoot, StateSubpath),
    hooks = await plugin[PluginExport](null, { stateDirectory })
  try {
    Assert.deepEqual(Object.keys(hooks).sort(), ExpectedHooks.sort())
    const config = {}
    await hooks.config(config)
    Assert.ok(
      config.command[Command].template.includes(
        path.join(isolatedRoot, InstructionsFile)
      )
    )
    const context = JSON.parse(
      await hooks.tool[ContextTool].execute(
        {},
        { sessionID: Session, agent: PlanAgent }
      )
    )
    Assert.equal(context.planFile, null)
    Assert.equal(context.host, Host)
    Assert.equal(context.sessionId, Session)
    Assert.equal(context.stateDirectory, stateDirectory)
    Assert.equal(context.capabilities.permissionModeSwitch, false)
  } finally {
    await hooks.dispose()
  }
  console.log(
    "OpenCode package contracts passed from an isolated copy without runtime dependencies; live Google review remains unverified."
  )
} finally {
  if (OriginalRootOverride == null) delete process.env[RootEnvironmentKey]
  else process.env[RootEnvironmentKey] = OriginalRootOverride
  await rm(isolatedRoot, { recursive: true, force: true })
}
