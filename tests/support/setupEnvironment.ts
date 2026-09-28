import { mkdtempSync } from "node:fs"

import { HostRegistry, HostRuntime } from "claude-gdoc-review-plugin/host/index"

import { PluginConfig } from "claude-gdoc-review-plugin/config/index"

import { TestEnvironment } from "./testEnvironment.js"

const { [TestEnvironment.WorkerIdEnvironmentKey]: workerId } = process.env

// `globalSetup` created the run directory and exported it before any worker was
// forked; this file only makes the per-worker config directory inside it, and
// it does so before any test module is loaded.
process.env[PluginConfig.ConfigDirectoryEnvironmentKey] = mkdtempSync(
  TestEnvironment.newConfigDirectoryTemplate(
    workerId == null || workerId === ""
      ? TestEnvironment.DefaultWorkerId
      : workerId
  )
)

// Keep new Codex adapter tests out of the developer's actual Codex state.
process.env[HostRuntime.CodexHomeEnvironmentKey] =
  process.env[PluginConfig.ConfigDirectoryEnvironmentKey]

// Isolate OpenCode state as well, including default-resolution tests.
process.env[HostRegistry.OpenCodeStateHomeEnvironmentKey] =
  process.env[PluginConfig.ConfigDirectoryEnvironmentKey]
