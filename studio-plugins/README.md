# Studio's own plugins

A plugin marketplace Studio loads beside text-to-cad's (`scripts/studio.ts`). The launcher copies
it into Studio's state folder at every start and writes each plugin's machine-specific MCP
configuration there (`codex.mcp.json`), so nothing in this folder names a path on one computer.

- `solidcraft`: SolidCraft (https://github.com/bherbruck/solidcraft, Apache-2.0), a parametric CAD
  engine, behind an editor page of its own (`editor/`, built at launch by `scripts/editor-pages.ts`).
  Parts written as text-to-cad scripts are edited in text-to-cad's own viewer instead (its edit
  mode). `server/server.mjs` runs `solidcraft-cli mcp` headless for each
  thread (the plugin host runs one process per thread, shared by the agent and its tabs) and adds
  `editor_open`, a `.solidcraft` file view and the page's own calls. Hand edits save the design,
  write its STEP beside it and are told to the agent on its next call. The `solidcraft-*` skills
  are SolidCraft's own, taken at v0.13.1 with its `LICENSE-APACHE` and `NOTICE`;
  `studio-solidcraft` is Studio's. Offered only with `STUDIO_SOLIDCRAFT=1` and SolidCraft installed
  in Applications (`STUDIO_SOLIDCRAFT_APP=1` bridges it to the app, control port 7878).

## Industry packs

One plugin for each industry, each a skill that builds on the cad skill and adds what that industry
needs: its sizes, its construction rules, the file its makers take, and how to check the result.
None has a server or a view of its own: the model and drawing views show what they make. A pack is
a plugin so that it can be turned on by the people who make that kind of thing, and its description
stays out of the agent's context for everyone else.

- `apparel`: sewing patterns from body measurements, graded, with seam checks, a cutting-room DXF
  (AAMA/ASTM D6673), a 1:1 SVG and a size spec for a tech pack.
- `packaging`: a folding carton from the product's size and the board's caliper, its dieline (cut
  and crease layers), and the carton folded up to check it closes and the product fits.
- `woodworking`: furniture from sheet goods, with its joints, a cut list checked against the model,
  the boards laid out on sheets and edge banding lengths.
- `jewelry`: a ring at a ring size with a stone and its seat, the metal as one castable body, and
  its weight from the model's volume.
- `footwear`: a sole unit from a foot's length and width, and a curved piece of an upper flattened
  into its flat pattern with the stretch it needs.

A skill ships no program, so the script an agent starts from is a fenced block in a reference under
a `<!-- file: NAME.py -->` line. `scripts/studio-plugins-check.py` checks every plugin here (listed,
whole, links that resolve, carried scripts that parse; Studio CI runs it) and with `--run` runs the
carried scripts through `cad run`. Change a carried script by running it first, then putting the
run text in the reference.

The launcher lists this folder as a catalog (`scripts/studio.ts`), and none of the packs is on until
a person turns it on: the Toolbox page's Industries has a switch for each
(`apps/web/src/components/workbench/library/Industries.tsx`), which finds them by the `category`
their listing here carries. Each pack's jobs in a part's Toolbox are in
`apps/web/src/components/workbench/industryJobs.ts`. A new pack needs its row in `industries.ts`
and its jobs there.

Not yet done: the packaged app does not carry this folder (`scripts/build-studio-app.sh`), so the
packs are in a checkout's Studio only.
