import { identity } from "lodash"
import type { CommandModule } from "yargs"

import { CodexSupport, getActiveHost, HostKind } from "../../host/index.js"
import type { CliState } from "../CliState.js"
import { printJson } from "../commandSupport.js"

/** Read-only diagnostic command for verified host capabilities. */
export namespace CapabilitiesCommand {
  /** CLI subcommand. */
  export const Name = "capabilities"
}

/** Reports support honestly without creating a review or changing host settings. */
export function createCapabilitiesCommand(): CommandModule<CliState.Arguments> {
  return {
    command: CapabilitiesCommand.Name,
    describe: "Report host capabilities and release prerequisites",
    builder: identity,
    handler: () => {
      const host = getActiveHost(),
        codex = host === HostKind.codex
      printJson({
        host,
        inPlanWritesVerified: codex ? CodexSupport.InPlanWritesVerified : true,
        permissionModeSwitch: !codex,
        blocker: codex ? CodexSupport.Blocker : null,
        message: codex ? CodexSupport.Message : null
      })
    }
  }
}
