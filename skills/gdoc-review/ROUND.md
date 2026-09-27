# Google Doc review round

{{reason}}, so this plan cannot be approved yet. Run one full review round
against the Google Doc, then present the approval menu. Do not call
`ExitPlanMode` again until the user picks one of the two approve options.

- Google Doc: {{docUrl}}
- Document id: `{{docId}}`
- Plan file: `{{planFile}}`
- This round produces **revision {{nextRevision}}**.

{{sharedWorkflow}}

## 5. Present the approval menu

Call `AskUserQuestion` with this single question, substituting the real counters
for the two zeros:

{{menuSpec}}

Present it exactly as written above. The plugin matches the header, the question
text — its title line, the Doc link and the revision — the four labels, their
order **and their descriptions**: a question that differs in any of them is not
the review menu, and the answer is not recorded. The two counters are the only
part you fill in, and the answer is read from the tool's response — never from
what you sent.

## 6. Act on the answer

- **Approve and Use Auto Mode** or **Approve Manual Mode** → call `ExitPlanMode`
  immediately. The hooks approve it and switch the permission mode, so no
  approval dialog appears. Afterwards reply on the revision-log thread with
  `{{replyPrefix}} ✅ Plan approved (<mode>) at <ISO 8601 UTC time>` — omit
  ` (<mode>)` when no mode switch was announced to you, which is what happens
  when Claude Code's own approval dialog approved the call instead. An approval
  is spent by the first `ExitPlanMode` it answers and expires 30 minutes after
  the user gave it — call `ExitPlanMode` right away, and present the menu again
  if you are told to. An approval recorded with the CLI `decision` command
  instead of the menu opens this gate but leaves Claude Code's own approval
  dialog in place, which is the fallback, not a fault.
- **Check Google Doc for new comments and changes** → start again at step 1. If
  nothing changed in the Doc, present the menu again and say so.
- **Do something else** → the row itself says nothing about what to do, so ask
  the user what they want, stay in plan mode, and present the menu again once it
  is handled.
- **Any free text the user typed instead** → do what the user asked, stay in
  plan mode, and present the menu again once it is handled.
