import Assert from "node:assert"
import path from "node:path"

import type { Hooks, Plugin } from "@opencode-ai/plugin" with {
  "resolution-mode": "import"
}
import { z } from "zod"

import { createHookContext, HookContext } from "../../hooks/HookContext.js"
import { dispatchHook } from "../../hooks/HookDispatcher.js"
import {
  HookEventName,
  HostToolName,
  parseHookInput,
  SessionStartHookInput
} from "../../hooks/HookInput.js"
import { PermissionDecision } from "../../hooks/HookOutput.js"
import { locateReview } from "../../hooks/ReviewLookup.js"
import { resolvePluginRoot } from "../../plugin/PluginRoot.js"
import { isNonEmptyString, isRecord } from "../../utils/index.js"
import { getHostDefinition } from "../HostRegistry.js"
import { HostKind } from "../HostRuntime.js"
import { OpenCodeToolNames } from "./OpenCodeToolNames.js"

type NativeToolInput = Parameters<Hooks["tool.execute.before"]>[0]

/** Injectable local dependencies; no SDK client or network access is needed. */
export interface OpenCodePluginOptions {
  /** Installed root for instructions and the bundled CLI. */
  pluginRoot?: string
  /** Explicit state root for isolated tests or operator-selected storage. */
  stateDirectory?: string
  /** Pre-built local review context used by contract tests. */
  context?: HookContext
}

/** Native OpenCode integration constants. */
export namespace OpenCodePlugin {
  /** User-invoked slash command; existing user definitions take precedence. */
  export const CommandName = "gdoc-review"
  /** Read-only tool supplies the actual native session id for snapshot binding. */
  export const ContextToolName = "gdoc_review_context"
  /** A planning agent is required to record native review approval. */
  export const PlanAgent = "plan"
  /** Version used for SDK compile checks and source-derived fixtures. */
  export const ContractVersion = "1.18.32"
  /** Native event that ends in-memory agent tracking. */
  export const SessionDeletedEvent = "session.deleted"
  /** User configuration may override storage, never hook approval evidence. */
  export const OptionsSchema = z
    .object({ stateDirectory: z.string().min(1).optional() })
    .strict()
  /** Delimiter when appending model-facing hook feedback to a native result. */
  export const ContextSeparator = "\n\n"
  /** Native MCP text-content discriminator. */
  export const TextContentType = "text"
}

function sessionInput(sessionId: string): SessionStartHookInput {
  return {
    hook_event_name: HookEventName.SessionStart,
    session_id: sessionId,
    transcript_path: null
  }
}

function additionalContext(result: unknown): string {
  if (!isRecord(result) || !isRecord(result.hookSpecificOutput)) return null
  const { additionalContext: message } = result.hookSpecificOutput
  return isNonEmptyString(message) ? message : null
}

function appendFeedback(output: unknown, message: string): void {
  if (!isNonEmptyString(message) || !isRecord(output)) return
  // Built-in tools use output/metadata; MCP after-hooks receive the raw MCP result.
  if (Array.isArray(output.content)) {
    output.content.push({ type: OpenCodePlugin.TextContentType, text: message })
  } else if (typeof output.output === "string") {
    output.output += OpenCodePlugin.ContextSeparator + message
  }
}

/** Builds native hooks around shared, local-only review processing. */
export async function createOpenCodeHooks(
  options: OpenCodePluginOptions = {}
): Promise<Hooks> {
  const {
    pluginRoot = resolvePluginRoot(HostKind.opencode),
    stateDirectory,
    context = await createHookContext({
      host: HostKind.opencode,
      pluginRoot,
      stateDirectory
    })
  } = options
  Assert.equal(
    context.host,
    HostKind.opencode,
    "OpenCode requires its own review context"
  )
  const definition = getHostDefinition(context.host),
    instructionsFile = path.join(pluginRoot, definition.instructionsSubpath),
    sessionAgents = new Map<string, string>()
  let serverNames: string[] = []

  function normalizeToolEvent(
    event: HookEventName,
    input: NativeToolInput,
    args: unknown,
    response: unknown = null,
    toolName = input.tool
  ) {
    return parseHookInput({
      hook_event_name: event,
      session_id: input.sessionID,
      transcript_path: null,
      permission_mode: sessionAgents.get(input.sessionID),
      tool_name: toolName,
      tool_use_id: input.callID,
      tool_input: args,
      tool_response: response
    })
  }

  async function sessionContext(sessionId: string): Promise<string> {
    if (!isNonEmptyString(sessionId)) return null
    const input = sessionInput(sessionId),
      review = await locateReview(input, context)
    if (review == null || review.state == null) return null
    return additionalContext(await dispatchHook(input, context))
  }

  return {
    config: async config => {
      serverNames = Object.keys(config.mcp ?? {})
      const { command: commands = {} } = config
      config.command = {
        ...commands,
        [OpenCodePlugin.CommandName]: commands[OpenCodePlugin.CommandName] ?? {
          description: "Review the current complete plan in Google Docs",
          agent: OpenCodePlugin.PlanAgent,
          template: `Read ${instructionsFile} and follow the OpenCode adapter. Call ${OpenCodePlugin.ContextToolName} to obtain the actual host session id. Review request: $ARGUMENTS`
        }
      }
    },
    tool: {
      [OpenCodePlugin.ContextToolName]: {
        description:
          "Read this OpenCode session's Google Doc review binding and installed instructions. This does not write a snapshot, change permissions, or approve a review.",
        args: {},
        execute: async (_args, nativeContext) => {
          const input = sessionInput(nativeContext.sessionID),
            review = await locateReview(input, context)
          return JSON.stringify({
            host: context.host,
            sessionId: nativeContext.sessionID,
            agent: nativeContext.agent,
            instructionsFile,
            planFile: review == null ? null : review.planFile,
            stateDirectory: context.store.config.stateDirectory,
            capabilities: definition.capabilities
          })
        }
      }
    },
    "chat.params": async input => {
      sessionAgents.set(input.sessionID, input.agent)
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool !== HostToolName.question) return
      const normalized = normalizeToolEvent(
          HookEventName.PreToolUse,
          input,
          output.args
        ),
        result = await dispatchHook(normalized, context)
      if (isRecord(result) && isRecord(result.hookSpecificOutput)) {
        Assert.ok(
          result.hookSpecificOutput.permissionDecision !==
            PermissionDecision.deny,
          String(result.hookSpecificOutput.permissionDecisionReason)
        )
      }
    },
    "tool.execute.after": async (input, output) => {
      const toolName =
        input.tool === HostToolName.question
          ? input.tool
          : OpenCodeToolNames.normalize(input.tool, serverNames)
      if (toolName == null) return
      const normalized = normalizeToolEvent(
          HookEventName.PostToolUse,
          input,
          input.args,
          output,
          toolName
        ),
        result = await dispatchHook(normalized, context)
      appendFeedback(output, additionalContext(result))
    },
    "experimental.chat.system.transform": async (input, output) => {
      const message = await sessionContext(input.sessionID)
      if (message != null) output.system.push(message)
    },
    "experimental.session.compacting": async (input, output) => {
      const message = await sessionContext(input.sessionID)
      if (message != null) output.context.push(message)
    },
    event: async ({ event }) => {
      if (event.type === OpenCodePlugin.SessionDeletedEvent)
        sessionAgents.delete(event.properties.info.id)
    },
    dispose: async () => {
      sessionAgents.clear()
      serverNames = []
    }
  }
}

/** Stock OpenCode plugin entry; SDK types are compile-time only. */
export const GDocReviewOpenCode: Plugin = async (_input, options = {}) =>
  createOpenCodeHooks(OpenCodePlugin.OptionsSchema.parse(options))
