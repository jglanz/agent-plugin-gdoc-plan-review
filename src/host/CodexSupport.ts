/** Honest release status, independent of successful packaging and unit tests. */
export namespace CodexSupport {
  /** No supported stock-client exception has been verified. Not a user bypass flag. */
  export const InPlanWritesVerified = false
  /** Diagnostic code exposed by the capability command. */
  export const Blocker = "in_plan_writes_unverified"
  /** Instruction shared by the skill, hook reminders, and capability report. */
  export const Message =
    "Codex in-Plan review writes are not verified. A plugin cannot override native Plan-mode instructions. Do not create snapshots, sync Docs, or post comments when those instructions prohibit writes. Keep the review pending and report this host prerequisite."
}
