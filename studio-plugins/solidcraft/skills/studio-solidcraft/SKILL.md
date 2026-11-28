---
name: studio-solidcraft
description: Use whenever a part is designed in SolidCraft from Studio, before any solidcraft-modeling or solidcraft-editing step. The engineer sees the design in Studio's part editor tab and changes it by hand there; you work on the same design through the solidcraft tools.
---

# Working beside an engineer in Studio's part editor

The thread's SolidCraft design is open in Studio's part editor, a tab beside the chat. The engineer
sees the model there and changes it by hand: they double-click a dimension on the model and type a
value or a formula, edit the named sizes, and rename, suppress or roll back features in the
timeline. You work on the same design through the `solidcraft` tools. Their edits and yours land in
one design, and the editor shows yours as you make them.

## Their edits

- When the engineer changed the design since your last call, the next SolidCraft tool result begins
  with what they changed ("set width from `75 mm` to `70 mm`"). Their edits stand: never undo,
  revert or "fix" a value they set unless they ask.
- Mention their change in a line when it bears on what you do next ("You set the wall to 3 mm, so
  the boss fits at 6 mm").
- If one of their changes breaks a later feature, say which and propose the fix, then wait for a go.
- Do not recheck or rebuild because they edited something. Check when they ask, or when your own
  change needs it.

## Starting or opening a part

- Run `inspect_design {"measure":false,"sketches":false}` first.
- Use `new_design` only when they asked for a new part, and only when nothing unsaved is open (ask
  first if it is).
- Save a new design into this thread's folder right away, named for the part:
  `save {"path":"<folder>/servo_bracket.sc"}`.
- Then call `editor_open` so the engineer sees it (`editor_open {"path": ...}` opens a file first).
- Put the sizes that matter in user parameters with plain names (`width`, `wall`, `hole_d`): the
  editor lists them for the engineer to change, and sketch dimensions that use them follow.

## After a change you make

- `save {}`, then export the part as STEP beside the design:
  `export {"path":"<folder>/<name>.step"}`. Studio's viewer and its manufacturing and FEA checks
  read that STEP. The editor saves and exports the same way after the engineer's own edits.
- Say what you changed in a line: which parameters and features, from what to what.

## Failed checks

When a Studio check on the exported STEP fails, propose the change to the design (which parameter
or feature, to what, and why) and wait for a go before making it.
