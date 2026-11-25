---
name: brainstorm
description: "Brainstorm concepts, with the cad skill. Use whenever the person asks for concepts, ideas or options for a part before choosing one, and when the person asks for $brainstorm; it says how Studio reads the result."
---

# Brainstorm concepts

One job, the same one as the "Brainstorm concepts" tile in a part's Toolbox in Studio. Do it with
the `cad` skill: read that skill first and follow it, then do what the person asks:

> Make 4 concepts of the part with $brainstorm, each a really different way to do its job.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: Four concepts as real parts, each with its picture and weight, to open or grow more from.

## What to start from

- The sketch, photo or drawing the person attached (its copy is in `brief/references/`, which the
  message links), their words, or the part they name: read all of it first. Its sizes, and what it
  must hold, fit or fasten to, are the brief. With no part named or open, they are the start: ask
  nothing first.
- "More like this" names a concept by its script: read that script, keep what makes it work and
  vary the rest.
- Build first, then ask: where the brief leaves something open, choose, and ask about it after.

## Make four real concepts

Take the next free set number `<n>` (`brainstorm/set-1/` is the first; look at what is there).
Four concepts, `a` to `d`, each:

- its own part script, `parts/concept_<n><letter>.py`, one `@model`, meeting the same brief by a
  really different approach: how it is made, where the material goes, how it fastens;
- a real material on the part, built and checked as usual;
- its picture, `cad model snapshot "$ID" brainstorm/set-<n>/<letter>.png --preview`;
- its mass, from `cad model inspect "$ID"`.

Do not open the concepts in the viewer one by one: Studio shows the set under your reply, and the
person opens the one they want.

## Write the set

As each concept is built, rewrite `brainstorm/set-<n>/concepts.json` with every concept so far:

```json
{
  "concepts": [
    {
      "name": "Ribbed L bracket",
      "idea": "A folded plate with two ribs, the cheapest to make.",
      "script": "parts/concept_1a.py",
      "picture": "brainstorm/set-1/a.png",
      "material": "6061-T6 aluminium",
      "mass_g": 42.7
    }
  ]
}
```

- `name`: two to four words. `idea`: one plain sentence on how it differs from the others.
- `mass_g`: the mass `cad model inspect` reported, in grams, or `null` when it was not measured.
  Write only numbers a cad command measured.

End with one or two specific questions about the concepts: which way to take, and what the brief
left open.
