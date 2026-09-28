import { identity } from "lodash"
import type { CommandModule } from "yargs"

import { getActiveHost, getHostDefinition } from "../../host/index.js"
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
      const host = getActiveHost()
      printJson({
        host,
        ...getHostDefinition(host).capabilities
      })
    }
  }
}
