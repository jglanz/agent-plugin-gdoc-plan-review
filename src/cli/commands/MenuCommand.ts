import Assert from "node:assert"

import type { CommandModule } from "yargs"

import { getActiveHost } from "../../host/index.js"
import { sha256OfFile } from "../../plan/index.js"
import { getNativeReviewProtocol } from "../../host/NativeReviewProtocol.js"
import { ReviewStatus } from "../../state/index.js"
import { isNonEmptyString } from "../../utils/index.js"
import type { CliState } from "../CliState.js"
import { createCliStore } from "../CliState.js"
import {
  assertReviewState,
  PlanOptionDefinition,
  printJson,
  resolvePlanFile
} from "../commandSupport.js"

/** Plan whose native question should be rendered. */
export interface MenuCommandArguments extends CliState.Arguments {
  /** Absolute path of the complete plan. */
  plan: string
}

/** Native menu command constants. */
export namespace MenuCommand {
  /** CLI subcommand. */
  export const Name = "menu"
}

/** Renders a question but never records an answer or approval. */
export function createMenuCommand(): CommandModule<
  CliState.Arguments,
  MenuCommandArguments
> {
  return {
    command: MenuCommand.Name,
    describe:
      "Render the harness-native approval question for the synchronized plan",
    builder: { plan: PlanOptionDefinition },
    handler: async argv => {
      const protocol = getNativeReviewProtocol(getActiveHost())
      const store = await createCliStore(),
        planFile = resolvePlanFile(argv.plan),
        state = await assertReviewState(store, planFile),
        digest = await sha256OfFile(planFile)
      Assert.ok(
        state.status === ReviewStatus.active &&
          state.doc != null &&
          state.lastSync != null &&
          isNonEmptyString(digest) &&
          state.lastSync.planSha256 === digest,
        "A current successful sync is required before presenting the menu"
      )
      printJson({ questions: [protocol.createQuestion(state, digest)] })
    }
  }
}
