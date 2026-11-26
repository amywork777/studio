/**
 * How the agent brainstorms concepts: the `brainstorm` job skill's own instructions, after its
 * hand-off (`jobSkillFiles`). Studio reads the set file it writes (`brainstorm.ts`) and draws a card
 * per concept under the reply, so this is that file's contract as much as a method.
 */
export const BRAINSTORM_GUIDE = `## What to start from

- The sketch, photo or drawing the person attached (its copy is in \`brief/references/\`, which the
  message links), their words, or the part they name: read all of it first. Its sizes, and what it
  must hold, fit or fasten to, are the brief. With no part named or open, they are the start: ask
  nothing first.
- "More like this" names a concept by its script: read that script, keep what makes it work and
  vary the rest.
- Build first, then ask: where the brief leaves something open, choose, and ask about it after.

## Where concepts go

The project context's Concepts section names this chat's concepts folder, \`<concepts>\`. Every
concept lives there, never in the project's folders: the person moves the one they choose into the
project from its card, and the rest stay in the chat. So does everything about them: each check,
study, stress picture and note goes in the set's folder, and no report or document about the
concepts goes in the project (the reply and its cards are the summary). In the project, write at
most the brief in the README. Take the next free set number \`<n>\`
(\`<concepts>/set-1/\` is the first; look at what is there) and make the set's folder.

## Make four real concepts

Four concepts, each:

- its own script, \`<concepts>/set-<n>/<name>.py\`, where \`<name>\` is the concept's name as a
  Python name (\`ribbed_l_bracket\`) and its one \`@model\` function is named the same;
- self-contained: it imports only cad, build123d and their materials, never another script;
- meeting the same brief by a really different approach: how it is made, where the material goes,
  how it fastens;
- a real material on the part, built with \`cad run\` and checked as usual;
- its picture, \`cad model snapshot "$ID" <concepts>/set-<n>/<name>.png --preview\`;
- its mass, from \`cad model inspect "$ID"\`.

Do not open the concepts in the viewer one by one: Studio shows the set under your reply, and the
person opens the one they want.

## Write the set

As each concept is built, rewrite \`<concepts>/set-<n>/concepts.json\` with every concept so far:

\`\`\`json
{
  "concepts": [
    {
      "name": "Ribbed L bracket",
      "idea": "A folded plate with two ribs, the cheapest to make.",
      "script": "ribbed_l_bracket.py",
      "picture": "ribbed_l_bracket.png",
      "material": "6061-T6 aluminium",
      "mass_g": 42.7
    }
  ]
}
\`\`\`

- \`script\` and \`picture\`: file names in the set's folder, no path.
- \`name\`: two to four words. \`idea\`: one plain sentence on how it differs from the others.
- \`mass_g\`: the mass \`cad model inspect\` reported, in grams, or \`null\` when it was not measured.
  Write only numbers a cad command measured.

End the reply with one or two specific questions about the concepts (which way to take, and what
the brief left open), then the set's file as a link on its own line:
\`[Concepts, set <n>](<concepts>/set-<n>/concepts.json)\`. Studio draws the cards from that link.
`;
