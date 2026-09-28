import { cp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { FsUtils } from "claude-gdoc-review-plugin"

import {
  BundleTestEnvironment,
  createBundleTestEnvironment,
  destroyBundleTestEnvironment,
  PluginRootPath,
  runBundle
} from "../support/processTestSupport.js"

const OpenCodeValidationScript = "scripts/validate-opencode.mjs"
const OpenCodeInstructionsFile = "skills/gdoc-review/OPENCODE.md"
const OpenCodeBundleFile = "dist/opencode.mjs"
const ValidationScript = "scripts/validate-codex.mjs"
const PackageResources = [
  "plugin.json",
  ".codex-plugin",
  "hooks",
  "skills",
  "dist"
]
const HookFile = "hooks/codex.json"
const WorkflowFile = "skills/gdoc-review/WORKFLOW.md"
const PolicyFile = "skills/gdoc-review/agents/openai.yaml"
const WrongHookCommand = "node wrong-host.cjs"
const InvalidPolicy = "policy: allow_implicit_invocation: false\n"
const Indent = 2

describe("Harness package contracts", () => {
  let environment: BundleTestEnvironment = null

  beforeEach(async () => {
    environment = await createBundleTestEnvironment()
    await Promise.all(
      PackageResources.map(resource =>
        cp(
          path.join(PluginRootPath, resource),
          path.join(environment.workspacePath, resource),
          { recursive: true }
        )
      )
    )
  })

  afterEach(async () => {
    await destroyBundleTestEnvironment(environment)
  })

  async function validate(script = ValidationScript) {
    return runBundle(environment, [environment.workspacePath], {
      scriptFile: path.join(PluginRootPath, script)
    })
  }

  it("validates a dependency-free installation containing both host adapters", async () => {
    expect((await validate()).exitCode).toBe(0)
  })

  it("loads the OpenCode plugin from a dependency-free copy", async () => {
    const result = await validate(OpenCodeValidationScript)
    expect(result.stderr).toBe("")
    expect(result.exitCode).toBe(0)
  })

  it.each([OpenCodeInstructionsFile, OpenCodeBundleFile])(
    "rejects an incomplete OpenCode installation missing %s",
    async file => {
      await rm(path.join(environment.workspacePath, file))
      expect((await validate(OpenCodeValidationScript)).exitCode).not.toBe(0)
    }
  )

  it("rejects a hook routed to the wrong host", async () => {
    const file = path.join(environment.workspacePath, HookFile),
      hooks = JSON.parse(await readFile(file, FsUtils.Encoding))
    hooks.hooks.PreToolUse[0].hooks[0].command = WrongHookCommand
    await writeFile(file, JSON.stringify(hooks, null, Indent))
    expect((await validate()).exitCode).not.toBe(0)
  })

  it("rejects a missing shared workflow", async () => {
    await rm(path.join(environment.workspacePath, WorkflowFile))
    expect((await validate()).exitCode).not.toBe(0)
  })

  it("rejects a malformed invocation policy", async () => {
    await writeFile(
      path.join(environment.workspacePath, PolicyFile),
      InvalidPolicy
    )
    expect((await validate()).exitCode).not.toBe(0)
  })
})
