import { chmodSync } from "node:fs"

import esbuild from "esbuild"

// The bundle entry: the CLI, whose `hook` subcommand is what hooks.json runs.
const EntryFile = "src/cli/index.ts"

const OutFile = "dist/gdoc-review.cjs"

// Bundled ESM dependencies (yargs-parser) read `import.meta.url` to build a
// `createRequire`. CJS output has no import.meta, and esbuild would emit an
// `undefined` that throws at load time, so the banner defines the equivalent
// and `define` rewrites every reference to it.
const ImportMetaUrlIdentifier = "__gdocReviewImportMetaUrl"

const Banner = [
  "#!/usr/bin/env node",
  `const ${ImportMetaUrlIdentifier} = require("node:url").pathToFileURL(__filename).href;`
].join("\n")

// `dist/gdoc-review.cjs` is the self-contained CLI: hooks.json and the bin
// launcher both invoke it with a bare `node`, so every dependency is inlined
// (source-map-support included) and nothing is marked external. The shebang
// banner + exec bit let it also be run directly.
const SharedBuildOptions = {
  bundle: true,
  platform: "node",
  target: "node24",
  sourcemap: "inline",
  minify: false,
  external: [],
  logLevel: "info"
}

await esbuild.build({
  ...SharedBuildOptions,
  entryPoints: [EntryFile],
  outfile: OutFile,
  format: "cjs",
  define: { "import.meta.url": ImportMetaUrlIdentifier },
  banner: { js: Banner }
})

chmodSync(OutFile, 0o755)

// The OpenCode loader imports an ESM module and calls each exported plugin.
// Keep only the plugin function in this entry and bundle every runtime dependency.
const OpenCodeEntryFile = "src/host/opencode/entry.ts"
const OpenCodeOutFile = "dist/opencode.mjs"
const OpenCodeBanner = [
  'import { createRequire as gdocCreateRequire } from "node:module";',
  'import { fileURLToPath as gdocFileURLToPath } from "node:url";',
  'import { dirname as gdocDirname } from "node:path";',
  "const require = gdocCreateRequire(import.meta.url);",
  "const __filename = gdocFileURLToPath(import.meta.url);",
  "const __dirname = gdocDirname(__filename);"
].join("\n")

await esbuild.build({
  ...SharedBuildOptions,
  entryPoints: [OpenCodeEntryFile],
  outfile: OpenCodeOutFile,
  format: "esm",
  banner: { js: OpenCodeBanner }
})
