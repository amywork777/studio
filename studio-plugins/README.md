# Studio's own plugins

A plugin marketplace Studio loads beside text-to-cad's (`scripts/studio.ts`). The launcher copies
it into Studio's state folder at every start and writes each plugin's machine-specific MCP
configuration there (`codex.mcp.json`), so nothing in this folder names a path on one computer.

- `solidcraft`: SolidCraft (https://github.com/bherbruck/solidcraft, Apache-2.0), a parametric CAD
  engine, behind an editor page of its own (`editor/`, built at launch by `scripts/editor-pages.ts`).
  Parts written as text-to-cad scripts are edited in text-to-cad's own viewer instead (its edit
  mode). `server/server.mjs` runs `solidcraft-cli mcp` headless for each
  thread (the plugin host runs one process per thread, shared by the agent and its tabs) and adds
  `editor_open`, a file view for `.sc` and `.solidcraft` designs and the page's own calls. Hand
  edits save the design, write its STEP beside it and are told to the agent on its next call. The
  `solidcraft-*` skills are SolidCraft's own, taken at v0.13.1 with its `LICENSE-APACHE` and
  `NOTICE`; `studio-solidcraft` is Studio's. Offered only with `STUDIO_SOLIDCRAFT=1` and SolidCraft
  installed in Applications (`STUDIO_SOLIDCRAFT_APP=1` bridges it to the app, control port 7878).
