import Assert from "node:assert/strict"
import { readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PluginName = "gdoc-plan-review-plugin"
const PortableSchema =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
const PortableManifest = "plugin.json"
const CompatibilityManifest = ".codex-plugin/plugin.json"
const CodexHooksFile = "./hooks/codex.json"
const OpenaiExtension = "com.openai"
const SkillPolicyFile = "skills/gdoc-review/agents/openai.yaml"
const ExplicitInvocationPolicyPattern =
  /^policy:\r?\n[ \t]+allow_implicit_invocation: false\s*$/m
const HookEvents = ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]
const RequiredResources = [
  "dist/gdoc-review.cjs",
  "skills/gdoc-review/SKILL.md",
  "skills/gdoc-review/CODEX.md",
  "skills/gdoc-review/WORKFLOW.md",
  "skills/gdoc-review/agents/openai.yaml"
]
const CommandType = "command"
const HookCommand =
  'node "${PLUGIN_ROOT}/dist/gdoc-review.cjs" hook --host codex'
const RootPath =
  process.argv[2] ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const Encoding = "utf8"

function readJson(relativeFile) {
  return JSON.parse(readFileSync(path.join(RootPath, relativeFile), Encoding))
}

const portable = readJson(PortableManifest)
const compatibility = readJson(CompatibilityManifest)
Assert.equal(portable.$schema, PortableSchema)
Assert.equal(portable.name, PluginName)
Assert.equal(compatibility.name, PluginName)
Assert.equal(portable.version, compatibility.version)
Assert.equal(portable.extensions?.[OpenaiExtension]?.hooks, CodexHooksFile)
const hooks = readJson(CodexHooksFile).hooks
Assert.deepEqual(Object.keys(hooks).sort(), [...HookEvents].sort())
for (const event of HookEvents) {
  Assert.ok(hooks[event].length > 0)
  for (const group of hooks[event]) {
    Assert.ok(group.hooks.length > 0)
    for (const hook of group.hooks) {
      Assert.equal(hook.type, CommandType)
      Assert.equal(hook.command, HookCommand)
      Assert.ok(Number.isInteger(hook.timeout) && hook.timeout > 0)
    }
  }
}
for (const resource of RequiredResources)
  Assert.ok(statSync(path.join(RootPath, resource)).isFile())
Assert.match(
  readFileSync(path.join(RootPath, SkillPolicyFile), Encoding),
  ExplicitInvocationPolicyPattern
)
// Package-contract validation, not proof of live client or in-Plan write support.
console.log(
  "Codex package contracts passed; live host support remains a separate release gate."
)
