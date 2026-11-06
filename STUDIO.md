# text-to-cad Studio

T3 Code made into a hardware app: agents design parts with the text-to-cad plugin, and the CAD
view follows their work beside the thread. It lives in this repository, on `main`.
Studio's laws are at the top of [AGENTS.md](AGENTS.md).

[text-to-cad](https://github.com/earthtojake/text-to-cad) is the `text-to-cad/` submodule, pinned
to `studio-base` on [amywork777/text-to-cad-upstream](https://github.com/amywork777/text-to-cad-upstream):
Jake's latest release, Amy's open text-to-cad PRs merged in, and Studio's Edit by hand on top
(`packages/cad/src/cad/edit/` and `packages/ui/src/renderers/xbf/edit/`). Nothing else of
Studio's lives there, so a new release or a PR's new commits come in by merging them into
`studio-base`, keeping its suites green, pushing it, and moving the pin here:

```sh
git submodule update --remote text-to-cad
git commit -m "text-to-cad: <what changed>" text-to-cad
```

The setup fetches it (`git submodule update --init text-to-cad`; not `--recurse-submodules`,
which trips on the vendored `.repos` tree's gitlinks). Set it up on a Mac with
`scripts/setup-studio.sh`, after Apple's command line tools and Node 24, and again after pulling.
It fetches the text-to-cad submodule at its pin, installs the packages (the repository's own vp, run through npx when
none is installed), fetches Electron, makes `text-to-cad/.venv` with uv (Python 3.13,
`requirements-dev.txt` and the `fea` extra), runs `npm ci`, `npm run build:packages` and
`scripts/bundle/bundle.sh` in `text-to-cad/`, and checks for Claude Code; it changes no shell
settings. `scripts/run-studio.sh` starts it:
`TEXT_TO_CAD_DEV=1 vpr studio:desktop`, from this repository's `text-to-cad/` (`TEXT_TO_CAD_ROOT`
points at another checkout). The development plugin is built with `text-to-cad/.venv`'s Python,
since a Mac's own python3 can be too old for the CAD tools (Python 3.14). A change to the viewer needs its packages
built (`npm run build:packages` in `text-to-cad/`) before Studio starts.

**The Mac app.** `scripts/build-studio-app.sh [version]` builds
`release/Studio-<version>-arm64.dmg`, which needs nothing else on an Apple silicon Mac. Its first
screen installs Claude Code and signs in, so the person needs only their own Claude subscription.
Its last step checks the built app (`scripts/studio-app-check.py`): with the app's own Python and a
scratch home, it builds the motor mount example's plate and solves every example's strength study,
each held to the answer the example ships with, and a build that fails is not offered for publishing. Building it needs Rust 1.95 or newer for the resource monitor (`RUSTUP_TOOLCHAIN=1.95` uses one
installed beside an older default) and about 7 GB free; the download is about 400 MB and the app 1.2
GB (from 0.1.4; 600 MB and 1.9 GB while the CAD tools went in twice). The disk image step reserves
its whole temporary image (about 2.3 GB) at once, so it fails with "No space left" while gigabytes
still show free. `build/studio-bundle` is read only to stage it: deleting it once the build logs
"Installing staged production dependencies" gives that step 1.5 GB. The build runs `vp run
build:desktop` in the checkout, which rewrites the `dist-electron` and server `dist` files a running
`vpr studio:desktop` watches, so that copy restarts once. Its scratch folders, the desktop build's
stage among them, are in `build/tmp`, not the system's temp folder, which macOS empties every night
at 3:35 of files no one has opened in three days: a build running then lost the bundle's empty files
and made an update zip short of the app's signature (2026-10-22). Publish a version as a release of
the public `amywork777/studio-download` (it holds only the downloads) with the asset
named `Studio-arm64.dmg`, as the script prints. The website, the guide page and that repository's
README link to `releases/latest/download/Studio-arm64.dmg`, so a new version changes no link.

**The website**, https://studio-for-mac.vercel.app, is one static page in `~/code/studio-site`, on
Amy's personal Vercel (`amy-zhous-projects-45e75853`); `vercel deploy --prod` there redeploys it.
Its screenshots are the sample project in a packaged app, driven over Chrome's debugging port
(`--remote-debugging-port`), since a plain browser can't draw Studio's 3D views.

- **What it carries** (`build/studio-bundle`):
  - the CAD tools with a Python of their own: uv's movable CPython 3.14, with the `cad`,
    `cad-server` and `cad-mcp` wheels and their dependencies pinned to the checkout's `.venv`. They make STL and DXF, and draws part pictures,
    in that Python, so the Mac needs no Node or browser for them;
  - the FEA solver, CalculiX from conda-forge (fetched by micromamba, its one-file build when the
    machine has none), which the app names to the CAD tools as `CAD_CCX`, so a strength check needs
    nothing installed. Windows's comes with OpenBLAS, not conda-forge's default MKL (about 100 MB
    against 600);
  - their plugin, laid out by `scripts/studio-app-plugin.py`, with the app's paths left as
    `@@STUDIO_…@@` placeholders;
  - the plugin's page;
  - the examples, finished projects (`studio-sample/<id>/`), which the Library's Examples section
    shows and Make a copy to edit copies into a new project (`T3CODE_SAMPLES_DIR`);
  - `studio.json`.
- **The build.** T3 Code's desktop build takes the bundle through `T3CODE_DESKTOP_STUDIO_BUNDLE`
  (`scripts/lib/studio-app.ts`). That gives it Studio's name, id, icon and copyright, and a plain
  DMG with no link schemes. The bundle goes in as a resource of its own and is kept out of
  `app.asar`, as T3 Code keeps its other staged resources: up to Mac 0.1.3 it was packed in both, so
  the app carried the CAD tools' Python twice. The name is also the `productName` in the app's
  package.json, which Electron starts the app under, so the app keeps its saved secrets in its own
  keychain item, "Studio Safe Storage". Under T3 Code's `t3code` it asked for T3 Code's item, and
  macOS wants the login password for that. Its package name, `text-to-cad-studio`, names the
  updater's download folder; under `t3code` the two apps' updaters shared one and emptied each
  other's downloads. By default it is signed ad hoc, without the hardened runtime, and has no update
  feed: macOS installs no update to an app signed ad hoc, so a new version is a new download.
- **Signed, it updates itself** (`STUDIO_SIGN=1`). The build signs with the Developer ID
  Application certificate in this Mac's keychain, under the hardened runtime with Studio's
  entitlements (`scripts/studio-app.entitlements.plist`: Electron compiles JavaScript as it goes,
  and the CAD tools' Python loads libraries signed by others), and Apple
  notarizes it. It skips T3 Code's passkey sign-in setup, which needs T3's own Apple profile. It
  carries a zip and Studio's update feed, the releases of `amywork777/studio-download`: T3 Code's
  updater checks 15 seconds after launch and every 4 minutes. It downloads nothing by itself and
  installs nothing on quit (T3 turns both off, `DesktopUpdates.ts`): a found update shows as the
  sidebar's update button, one click downloads it and the next restarts into it. The button is at
  the foot of the list beside the rail, and on the rail above Settings while the list is folded and
  an update waits (`StudioRail.tsx`). Under the hardened runtime without those
  entitlements, the bundled Python can't load its own library; with them it runs (checked
  2026-10-22, signed ad hoc with `--options runtime`).
  - **Once, on Amy's Mac:** join the Apple Developer Program; in Xcode, Settings, Accounts, Manage
    Certificates, add a Developer ID Application certificate; make an app-specific password at
    account.apple.com; then save it for notarization with
    `xcrun notarytool store-credentials studio-notary --apple-id <Apple ID> --team-id <Team ID>`
    (it asks for the password, which stays in the keychain).
  - **Each release:** `STUDIO_SIGN=1 APPLE_KEYCHAIN_PROFILE=studio-notary RUSTUP_TOOLCHAIN=1.95
scripts/build-studio-app.sh <version>`, then the `gh release create` line it prints: the DMG
    under its one name, and the zip, its blockmap and `latest-mac.yml` the updater reads. It needs
    about 10 GB free: the last release's files in `release/` and `build/studio-bundle` can go once
    it is published. 0.1.3 ran out on its last step (2026-10-22), which now moves the DMG and the
    zip out of the stage instead of copying them; its zip was made from the notarized DMG's app
    with `ditto -c -k --sequesterRsrc --keepParent`, as 0.1.2's was. 0.1.4 (2026-10-23) built
    whole from 8.6 GB free plus the 7.8 GB iOS simulator runtime Amy chose to delete. Publish as a
    draft with the Windows files too (`gh release create ... --draft`, then `gh release edit
--draft=false --latest`), so neither updater ever reads a release without its feed.
  - The first signed version is still a download: a copy signed ad hoc has no feed to find it.
- **On each start**, the app's boot step (`apps/desktop/src/studio/studioAppBundle.ts`) points
  it at `Resources/studio`:
  - its own home, `~/.text-to-cad-studio`;
  - its own Electron profile, named by its id, `com.amywork777.studio`, apart from T3 Code's;
  - its name;
  - the plugin, copied into the home with this copy's paths filled in.
- **Gatekeeper.** Unsigned, the person chooses Open Anyway once (System Settings, Privacy and
  Security). The boot step then clears the download's quarantine from the bundled Python, so
  macOS doesn't stop each of its programs again.

**The Windows app.** The same script, run in Git Bash on Windows, builds the installer
`release/Studio-<version>-x64.exe`. `.github/workflows/studio-windows.yml` runs it on GitHub's
windows-latest (Run workflow with a version, or a push to an `amy/studio-windows…` branch), installs
the result there, checks the installed app the same way, and keeps the installer, its
blockmap and `latest.yml` as the run's artifact for three days (`gh run download`). Publish it into
the version's release with the `gh release upload` line the script prints, which adds
`Studio-Setup.exe`, the download's one name. Both apps' updaters read the latest release, so from
0.1.3 on every release carries `latest-mac.yml` and `latest.yml` together: a release with only one
leaves the other platform's updater with an error. The 0.1.3 installer is about 320 MB (482 MB while
the CAD tools went in twice) and installs, with no questions, in about four minutes to
`%LOCALAPPDATA%\Programs\text-to-cad-studio`: the one-click installer names the folder by the
package name. The CAD tools' 20,000 or so small files are most of those minutes; one archive
unpacked on the first start would cut them. Their deepest path is about 220 characters under a
short user name, so a long one comes near Windows's 260.

- **Unsigned for now.** Windows warns the first time it opens (More info, then Run anyway), and
  Smart App Control or a company's IT can block it outright. Unlike macOS, Windows installs updates
  to an unsigned app, so every Windows build carries Studio's feed (`latest.yml`), and a signed
  version later updates an unsigned one. Signing is Microsoft Trusted Signing in Amy's name: an
  Azure account, a Trusted Signing account, identity validation as an individual, a certificate
  profile, and an app registration whose secrets go in this repository's GitHub secrets under the
  `AZURE_*` names T3 Code's build reads; then `STUDIO_SIGN=1` signs it.
- **Where it differs from the Mac's.** uv's Windows CPython keeps `python.exe` at the top of its
  folder (`resources\studio\python\python.exe`), and the boot step writes paths into the plugin
  with forward slashes, quoted in the skills when they hold a space (a user folder like
  `C:\Users\Amy Zhou`). T3 Code's Windows payload check holds its own payload to 80 loose files,
  to keep its installer quick; Studio's build skips that budget, since the CAD tools' Python alone
  is about 20,000 files (the rest of the app is 55). Its icon is the brand kit's `favicon.ico`,
  which has every size Windows draws.
- **Installing packages.** This Mac's checkouts leave `apps/mobile` out (a sparse checkout), and
  pnpm then refuses to install over the mobile app's unused patches. GitHub's checkout includes it
  and installs only the desktop app's packages, as T3 Code's release does; locally, add
  `apps/mobile` to the sparse checkout and install with the same `--filter`s.

## Run it

After `scripts/setup-studio.sh`, `scripts/run-studio.sh` opens the app. `vpr` is the repository's
own (`node_modules/.bin/vpr`, which setup installs; `run-studio.sh` puts it on the PATH):

```sh
TEXT_TO_CAD_DEV=1 vpr studio            # server and web
TEXT_TO_CAD_DEV=1 vpr studio:desktop    # the Electron app (what run-studio.sh runs)
```

`scripts/studio.ts` reads the checkout as a plugin marketplace and turns its `text-to-cad` plugin on
at first start, brands the app from `brand/`, and keeps state in `~/.text-to-cad-studio` (never in
T3 Code's `~/.t3`). `TEXT_TO_CAD_ROOT` points at another checkout; `TEXT_TO_CAD_STUDIO_HOME` moves
the state and `STUDIO_PROJECTS_DIR` the projects (`~/studio-projects`). Every checkout's engine
takes port 3346, so a second checkout's Studio beside a running one also needs
`TEXT_TO_CAD_STUDIO_ENGINE_PORT` (another free port): without it the `text-to-cad` plugin's CAD
server fails to start, `port 3346 is held by another CAD engine`.

Studio's CAD engine keeps its own folders and port, so a CAD engine of the person's own (on
3245, Claude Code's or Codex's plugin) and Studio's never find or retire each other: the packaged
app's under `~/.text-to-cad-studio/cad` on 3345, a checkout's (`scripts/studio.ts`, every mode)
under `~/.text-to-cad-studio-dev/cad` on 3346 (`apps/desktop/src/studio/studioEngine.ts`). Only
the desktop app's boot and `scripts/studio.ts` set them: a headless server started another way (a
remote `npx t3`, say) runs `cad` with its own folders and port.

## What it adds to T3 Code

Everything else is upstream T3 Code plus the fork's plugins (`FORK.md` on `main`).

- **Views the agent opens.** When the agent calls a plugin view's tool (`cad_open`), the view
  opens as a tab beside the thread with the call's arguments.
- **Follow the files.** When a run's file edit writes a file a view claims (a `.step`) and no view
  of that plugin is open, the file opens in one. Models a shell command builds arrive through the
  agent's own `cad_open` or `cad_show`. Open views refresh themselves, and a panel choice made
  during the run wins.
- **Bundled plugins.** `T3CODE_PLUGIN_MARKETPLACE` and `T3CODE_DEFAULT_PLUGINS`
  (`apps/server/src/plugins/BundledPlugins.ts`); a plugin the user uninstalls stays uninstalled.
- **A workbench, not a chat with a CAD tab.** `brand.json` `"layout": "workbench"` makes the right
  panel the main surface: the model or board viewer takes the window and the chat docks beside it
  at a width the user drags, one width for every thread, while the viewer absorbs a wider window
  (`apps/web/src/components/workbench`). With the engineering surfaces on, a thread opens on its
  project page, and the viewer comes forward when there is a model to show: the agent's `cad_open`
  (which `cad_show` asks for when no viewer is open), a model it writes, or a part the person
  opens. Without them a thread opens on its viewer the first time it shows, so the agent's
  `cad_show` has one to switch. One the user closes stays closed. With the room, the
  viewer's own findings show where it puts them: the verdict at the top of an FEA study, the
  findings in a CAM job, a board's checks. Studio lists none of its own.
- **The part stays in view.** Above the composer, what the viewer shows: its name, what it is
  (part, assembly, board, FEA study, CAM job), its units, its material and its last build. The
  viewer's own sync (`cad_sync`, relayed by the frame) says which model and its build; the
  viewer's routes, through `cad_http` once per revision, say the rest. Studio makes no call the
  plugin would count, and a fact the server does not hold is left out or said to be missing. A
  press brings the viewer back. The title block over the viewer also lists the part's checks, each
  opening its result, and a result on screen names the part it checked, a click away. A model a
  chat link or file chip names opens in the viewer, not as text.
- **Hardware starters.** A new thread offers hardware jobs from `brand.json` `starters` ("Route
  this board", "Post G-code for grbl"), each only while an enabled plugin has the skill it needs
  (`pcb`, `cam`). Without brand starters, it offers what the enabled plugins suggest
  (`interface.defaultPrompt`).
- **text-to-cad's look.** It's named Studio and wears text-to-cad's brand kit, not T3's: the CAD
  viewer's neutral palette (charcoal in dark), its animated mark on the loading splash, its mark
  beside the name, its favicons and dock icon (`brand/`, see its README). `T3CODE_BRAND_DIR` applies
  them (`apps/web/vite/brand.ts`) and `VITE_APP_BASE_NAME` names the app, its assistant messages and
  the desktop window. A theme the user picks keeps its own colors. T3's stage artwork gives way to
  its small stage pill. Other mentions of T3 Code stay: they describe T3's own machinery (T3
  Connect, its desktop updates), and rewording them would make every rebase conflict.

## Hardware first

For people who know hardware before code: `brand.json` `"focus": "hardware"`.

Its interface is a setting, Engineering, Engineering with code, or Code, Engineering by default, per
device. The switch is Settings, Appearance, Interface in the two code interfaces, and Settings,
Advanced, Interface in Engineering, where Appearance leaves the row out. The command palette has no
switch commands; searching settings for "interface" finds the switch in every interface. Engineering
puts every coding tool away (version control, editors, terminals, scripts, branches, pull requests,
diffs), names parts and documents rather than files ("Servo bracket", "Servo bracket drawing",
"Servo bracket STL", not `parts/servo_bracket.step`) on the project page, tabs, file chips in the
chat and the work log (`components/workbench/partNames.ts`), says what the agent's steps did to the
design ("FEA study on the L bracket", "Built the L bracket") instead of the command lines, and reads
like a shop drawing: a title block over the viewer with the part's type, units, material and build,
and documents the agent writes (plans, reports) opening beside the thread as documents with a title
block of their own. Engineering with code keeps those surfaces (the projects home, the project's
overview, the title block, documents) and brings every coding tool back in T3 Code's own words, with
Source beside the pinned Project tab for the explorer. Code shows T3 Code's surfaces as they are.
`<html data-studio-focus>` (`hardware`, `both` or `code`) carries the choice for `brand/theme.css`.

Settings in Engineering leave out what a programmer sets (`CODE_SETTINGS_ROWS` in
`components/workbench/engineeringSettings.ts`): the code font, agent update checks, response
streaming, the rich text composer, the send shortcut, follow-up behaviour, glass opacity and
contrast, a project's Workspace and Checkouts. Hiding changes nothing stored: each keeps its value
and default, and Engineering with code and Code show them all (Settings, Advanced, Interface is
the way there). Plugins, Diagnostics and Interface (the switch above, `/settings/interface`) sit
together under one Advanced group in the settings sidebar (`ADVANCED_SETTINGS_SECTIONS`,
`studioInterface.ts`); their own settings URLs are unchanged, and the code interfaces list neither
Diagnostics nor Interface as a section.

Engineering's composer has the model picker beside Send, as every chat app has it (Amy, 11/05: an
easy way to set the model), opened by "/model" and the model shortcut too, one model a chat (no
side-by-side runs of several); it has no Thinking or Speed choice. The model new chats start on,
with its Thinking and Speed, is Settings, AI agents, New chats (`DefaultModelRow`, the one row that edits the default model, which
General shows under "New threads" in the code interfaces). It applies to chats started afterwards,
to a draft that has not picked a model, and, in Engineering, to the open chat's next turn
(`workbench/defaultModelFollow.ts`: the chat that was in front when Settings opened takes a chosen
model once, when it is next shown, through the picker's own provider-lock check, which toasts when
the chat's provider cannot change). A reset to Automatic is not applied to an open chat; it forgets
the remembered composer pick.

Engineering also has no pull requests or usage page: `/pull-requests` and `/usage` open Home (a
replaced history entry), and the usage shortcut does nothing. The code interfaces keep all of these
as they were.

- **The project's overview.** The Project tab (Overview, in Engineering) opens on it: the project's
  README in its folder first, what it is and its decisions (`- <what was decided> (<YYYY-MM-DD>,
asked)`, or `by hand`; a decision written date first reads too), then every other section the
  README has as written, its links opening what they name. While a new project's only chat is on
  its first turn and the README has no words yet, the Overview shows lines of writing being drawn;
  the words that end that wait then come in one by one, once, and later changes read as they are
  (`useReadmeWriteIn`, `.readme-writing`). A new project's Overview opens beside its first chat so
  this shows. The agent is told to keep it, and on a
  new project's first turn to name the project, set its setup and write the README before anything
  else, then to make a first draft in that same turn, listing what it assumed, and ask at most one
  question after it (Amy, 2026-10-29: three questions before any part was too many). Every question
  it asks puts the answer it recommends first, a failed check comes with the fix it would make, and
  a finished job offers the next one (`RECOMMEND` in `packages/shared/src/studioProjects.ts`). Below it, modules: the lead part large, what was built last (or, with no part yet, Start a part by hand), beside the README with its sections folded to their headings; then, in Engineering, everything in the project in one place, latest first, the
  way Google Drive shows a folder (`components/workbench/ProjectEverything.tsx`): every kind of file
  together (its chats are down the left), each marked by its kind's icon
  (`KIND_TINT`), filtered by type (CAD, Electronics, Analysis, Manufacturing, Documents,
  References), as a list (name, kind, how a part's checks went or where a file is) or as cards with
  pictures (a part's with its checks, drawing and manufacturing files); then the parts' versions,
  the project's folders and the brief's links. The sidebar's Overview opens it across the window, as
  a Drive folder opens; opening a chat or a file from it brings the chat back with the file beside
  it. Going between the panel's tabs, the Overview's included, never grows or shrinks the panel
  (`frontTab`): only leaving an Overview that opened across the window steps back, once. With code tools on, the page keeps a module per kind (CAD, Electronics, then Documents and
  each other kind of file) and its Files, References and Threads tabs. In Engineering its New starts
  new designs only. A module shows once it has something in it, folds away (remembered on this
  computer), and is read again whenever the thread's agent changes files. Checks are the results
  text-to-cad writes beside the parts, `<name>.fea.json` (or a named study's
  `FEA/<name>.<study>.json`) and `<stem>.<process>.result.json`
  (`components/workbench/checkResults.ts`), named as an engineer says them (Strength, Vibration,
  Casting), a study that passes saying its safety factor; a drawing is the engineering drawing's
  `<part>_drawing.pdf`. Each opens with a click.
- **Import.** Studio scans the folders picked on this computer (Documents, Desktop and Downloads to
  start) for CAD models, drawings, parts lists, datasheets, photos and notes, and proposes a project
  for each folder that holds models or drawings, imported where it is: Studio only reads them. Loose
  files are placed in a project (copied into its folder) or left out; copies and older versions are
  listed and stay put. Import is on Home (files or a folder, or a scan), takes files dropped
  anywhere on Home, and offers the CAD files new in the scanned folders since the last scan; a
  project deleted forever from Trash is offered again. Inside a project, Import beside New, or files
  dropped on its Overview, copy what is picked into the project's folder, never over a file there
  (`importIntoProject.ts`). The desktop app reads and copies (`apps/desktop/src/studio/`); what
  makes a project is decided in the web (`components/workbench/importPlan.ts`).
- **No usage data.** T3 Code's analytics are off and keyless in this build
  (`apps/server/src/telemetry/AnalyticsService.ts`), so nothing about its use goes to T3.
- **Design history.** A turn that changed files ends with one line of what it changed in the
  design, a chip per part and document (a part's script, model, drawing and studies are one
  entry); a part's chip opens what changed in it at that turn, anything else opens beside the
  thread. The work log's groups say which parts they updated ("3 steps, updated the L bracket").
  With code tools on, the turn keeps T3 Code's changed-files card and the project page keeps its
  Threads tab.
- **References under answers.** In the Engineering interface, a run's settled final answer lists
  what it rests on, each source with its number, icon, name, where in it and when the agent opened
  it: this turn, earlier in this chat, not opened, or own knowledge (the last two quiet, never a
  status color) (`workbench/references/`). The agent is told to number its claims and end with a
  `Sources:` block (`SOURCES` in `studioProjects.ts`, part of the project context that only the
  Claude and Codex adapters pass on, so another provider's answer cites nothing); `splitSources`
  reads the block back and takes it out of the text where the list shows. What counts as opened is
  read from the chat's tool items, not its rows, so a collapsed turn counts, and only from a call
  that completed: a Read as the work log counts one (any provider's, by `path`, `filePath` or
  `file_path`), the CAD viewer's `cad_open` and `cad_show`, a page the agent fetched, and what Codex
  reads through the shell (`cat`, `nl`, `head`, `tail` or `sed -n` on one file). A search's hits and
  Codex's inline views are not opened. An answer that cites nothing lists what its turn opened in
  the thread's folder. Each row opens what it names beside the chat (`references/openReference.ts`):
  a part's script, with a model of its name beside it, opens that part at the cited line, and in the
  workspace selects the feature whose statement holds the line in the design tree (AI mode shows no features, so the script opens at those lines in front); a document at
  its line or heading; a page as a link in the chat does. The part's view hears the ask in its host
  context (`studio/focus`: the script's path, a line and a number for each press, behind the
  `studioFocus` capability) and says it has taken it, however it went, and whether a feature held
  the line (`studio/notifications/focus-taken`, `{ nonce, found }`), so no ask outlives its view
  (`viewerFocus.ts`, `edit/useHostFocus.js`). Where none did (a constant, an import, a helper's
  line, a line moved since the part was read, a part whose build failed), Studio opens the script at
  that line in front (`openInPanel`), as AI mode does, so a press never does nothing
  (`PluginViewFrame.tsx`).
- **Documents from templates.** New offers them under Documents (as do the Overview's Documents
  and the quick find); each starts a document the agent writes into `docs/`: a
  PRD, the engineering requirements, an FMEA or a design review, each with its sections
  (`newTemplates.ts` `DOCUMENT_TEMPLATES`; general to any engineering, so a team's own formats,
  such as a client's PRD or an xRD, come in as templates), or one of the person's own templates, any
  file in the Templates folder beside Studio's projects (`<projects folder>/Templates`), which the
  agent follows section by section (`documentTemplates.ts`; Add a template copies one in). The
  agent fills each section from the project and writes what is not known as an open question.
- **Sizes** (Amy, 2026-10-22: "Variables > pushing and pulling hundreds of features"). The
  Overview's Sizes is every named size in the project's scripts in one table, as a CAD tool's global
  variables (`ProjectSizes.tsx`): the shared ones first, with the parts that use them, then each
  part's own. Shared sizes live in `sizes.py` beside the parts, which import them by name (`from
sizes import WALL`); a script's imports resolve from its own folder, so that is where the file
  goes, the folder holding most of the parts (`text-to-cad/skills/cad/references/edit-mode.md` tells
  the agent). A number changes where it is written, a click away, and every part that imports its
  file builds again; a formula (`2 * WALL`) changes where its sizes are. Add shared size appends
  one, and Use it in parts asks the agent to put it to work; the agent is told of each change in a
  hidden note, as of a restore. A project with several folders shows each folder's sizes under its
  name, since each folder's imports are its own, and Add shared size writes in the first folder with
  sizes, saying which. The CAD service reads the sizes from the source without running anything
  (`cad/edit/sizes.py`, `/api/v1/local/sizes`), so a CAD service started before them needs a restart to
  show them.
- **Versions and What changed.** Every chat turn's checkpoint is a version. The Overview's
  Versions lists a part's versions, newest first, each with when and which chat made it (and Now,
  for a hand edit since the last turn), and shows what changed between the one picked and the one
  before, or any earlier one: the part as one model (added green, removed red, unchanged
  see-through grey) or side by side, the named sizes of its script that changed, its volume and
  size, how its checks went at each, and the script's lines on request. The CAD service reads the
  versions with git and compares the solids in a process of its own
  (`text-to-cad/packages/cad/src/cad/edit/versions.py` and `solid_diff.py`, ported from
  Fixture's `diff_revision.py`; routes `/api/v1/local/versions` and `/api/v1/local/versions/compare`). It
  writes under the project folder's `.studio/compare/`, which git is told to leave out. A picked
  version that is not the newest has Restore this version, as Google Docs does, with no question
  first: the part's file and its script go back to how that version had them
  (`/api/v1/local/versions/restore`), what was on disk kept first as a version unless one already holds
  it (a commit under `refs/studio/kept/`, made with an index of its own, listed as what you had
  before restoring), and the agent hears of it with the next message, as a hand edit's note.
- **Home, the switcher and the chats.** In Engineering, Home is where you start and pick up where
  you left off, and Projects is every project (Amy, 2026-10-23: they showed the same, since Projects
  went to Home): a top bar with the mark and a search that opens the quick find, then a box for what
  to make: the Start box, the AI's way in (`StudioHome.tsx`). Start sends what was typed to a new
  project (made, with a first chat that sends it as its first message), or, with a project of yours
  chosen beside Attach (`ProjectPicker.tsx`, the project switcher's own control and list,
  `ProjectChoices.tsx`), to a new chat in that project. One line is enough. Files can come with the
  words or alone (a PRD, requirements, sketches, CAD or a whole folder: Attach, or dropped on the
  box) and Start then makes a new project from them, or, with a project chosen beside Attach, opens
  a new chat in that project with them. They go into the project's References (`brief/references/`),
  where the Overview lists them and every chat can read them, and the first message names them and
  asks the agent to read them all before anything else, then fill in the project's name, setup and
  README from them and ask only what they leave open (`startMessage` in `startProject.ts`). A
  project can start from files alone, named after the first; in the web app, without paths to copy,
  they go with the first message instead. There is no Ask mode and no Set up mode (Amy, 2026-10-26:
  one Start box); a question goes in the box or in a chat. Then the starred projects and the last
  four worked on, with All projects to the Projects page (`ProjectsHome.tsx`: every project, a box
  to find one, the folders in no project), and New and Import beside them to add one (on the
  Projects page Import shows only in Engineering): New is the same New and dialog as a project's
  toolbar (`StudioNew.tsx`), where Create makes a new project and hands the job to its first chat,
  the kind of project its work needs (an assembly a product, a board or harness a circuit board, a
  robot description a robot, the rest a mechanical part: `projectKindFor`). There is one New: ⌘K's
  and the project switcher's New project open it, and Make a project on a folder in no project makes
  a mechanical part project of it at once, its brief filled in later. New's Part is New part, with
  no agent turn (`useNewPart.ts`, `newPart.ts`): on Home a project named "Untitled part" (then
  "Untitled part 2", past Trash's names too) with a starter part, `parts/part.py`, a CAD
  model of one block sketched from three named sizes as the cad skill writes its smallest part. Its
  Overview opens beside its new chat at once; the script is built by Studio's CAD service (edit
  mode's builds: the engine never builds a model because a view opened it), and the part opens in
  CAD mode by its document id once that build is done. In a project the same starter by the name
  given, the next name free in its folder. Start a part by hand is the same. A starter that can't be
  written, or a build that fails, leaves the project made, on its Overview, and says so, a failed
  build in its own words with Build again. Any change in CAD mode builds the part again from its
  script. Every project is pictured
  by its first assembly (else its first part or board; `useProjectCover.ts`), with Import, all in
  one column so the box and the tiles line up. A picture that came back empty (the CAD plugin still
  starting) is asked for again (`usePictures.ts`). A project with a chat waiting on the person (a
  question, an approval) comes first, says Needs you (on Home, in the switcher's list and in Cmd+K),
  and opens on that chat; Home lists no chats of its own. A tile's right-click, or the … on its
  hover, is the project's menu, the switcher's own actions in its words (`ProjectMenu.tsx`). A
  project opens in the thread last open in it on this device (else the one last worked on, else a
  new one), on its part beside the chat in CAD mode: the part left open there, else the one its
  tile pictures, else, with no part yet, its Overview across the window (Amy, 2026-10-28: getting
  to the part was confusing; `showProject`, `useShowProjectPart.ts`). A part the person opens
  anywhere (the Overview, Cmd+K, a sample's copy, Import, New part) opens the same way, in CAD
  (`openPartInCad`). Projects are listed as a
  recents list orders them, the one opened last on this device first (or worked on, if that came
  later), and the starred ones (kept on this computer) apart at the top of Home and the switcher.
  The sidebar is a rail of places down the far left, as Slack's (Amy, 2026-10-22, `StudioRail.tsx`):
  Home, Chats (with how many chats wait on you), Projects and Library, and Trash and Settings at its
  foot, each icon labelled and each opening its own page, as Claude's and ChatGPT's open Chats and
  Projects (Amy: "each one should open its own page"): Chats, every chat with a box to find one and
  an All | Needs you switch (`ChatPages.tsx`, `allChats.ts`), Needs you being the chats waiting on
  your answer or approval in any project, kept in the URL (`/chats?filter=needs-you`, where the old
  `/needs-you` lands); Projects, the Projects page; Library, the examples, document types and skills
  in one place. The rail marks the page that shows, and Projects inside a project
  (`studioPlaces.ts`). Beside the rail the column says where you are (`StudioSidebar.tsx`): on
  Studio's pages the recent chats, each with its project's name; inside a project, the project; on
  Settings, its sections (T3's settings list inside Studio's frame, `StudioSidebarFrame`), so the
  rail stays there too. Folding it (the panel button beside the window's controls, or its shortcut)
  keeps the rail (`collapsible="icon"`). The column is the same on every page: every project with
  its chats nested under it, as Claude lists folders and their sessions, so several projects can be
  worked on at once and their chats gone between in a click (`StudioSidebar.tsx`,
  `sidebarProjects.ts`). Projects order by work, never by opening, so a row stays under the pointer.
  Pressing a project folds or unfolds it and moves the person nowhere; its chat or Overview does. It
  stays as left on this device (`chatScope.ts`), and the project a chat opens in unfolds. Folded, it
  says Needs you or Working. Unfolded: Overview, New chat, then its chats, newest first, five and
  Show more, the open chat always among them. A right-click or the … on its hover is the project's
  menu (`useProjectMenu`). Folders in no project with a chat, and older chats in none, follow it.
  The project's switcher (`components/workbench/ProjectSwitcher.tsx`, also Cmd+O, which is the quick
  find on Home) is in the top bar beside the open chat, whose top is the project's own menu (Rename,
  Duplicate, a copy in a new folder made by the desktop app, Version history once it has a part,
  Back up, Show in Finder, and Move to Trash; T3's Remove project in Settings is hidden in
  Engineering). Like
  Claude's and Codex's sidebars, the panel button is a plain dark icon and the rows and their icons
  read dark, with the lists' labels quiet (`brand/theme.css`). T3 Code drew the button white for its
  stage artwork, which a fork's mark replaces, so on Studio's light sidebar it nearly vanished. The
  footer's Home icon is only in T3 Code's sidebar beside code tools, and its Settings only outside
  Studio's rail. Opening a chat from another project opens that project. What the project holds is
  on its Overview. The top bar names the project and the open chat; with the sidebar folded (T3 Code's
  toggle or its shortcut, and a part opening in CAD starts so, `workbench/sidebarFold.ts`) it leads
  with the mark. The panel's tabs are what was opened
  lately in the project, along its top as a browser's are (`brand/theme.css`), and the same beside
  each of the folder's chats, as a Chrome window's (`projectTabs.ts`): the Overview pinned first as
  its icon, then each file with its kind's colored icon (`FileKindIcon.tsx`) at its left and its
  close at its right, as Chrome's are, the one in front joined to the surface under it. There is
  no + (New is the one way to add), a panel with every tab closed shows the Overview, and a tab's
  menu has no Copy path in Engineering (the code interfaces keep it). A tab opens just right of
  the one in front (from the Overview, at the end), and closing the one in front goes back to the
  tab you were on before it, as a browser does: a drawing opened from its part and closed returns
  to the part, one opened from the Overview to the Overview (`rightPanelStore.ts`). The menu's
  Close others, Close to the right and Close all count the tabs shown, never the pinned Overview. The toolbar ends the
  tab row (`StudioPanelBar.tsx`, there is no row of its own): the AI | CAD switch, where the viewer
  in front has two layouts (the one way between them: no Back to AI beside it), then Import and New,
  always there, as Home has them (`StudioNew.tsx`, which hosts New's dialog in Engineering), with
  the tabs keeping their scroller and Import dropping to its icon beside chat; a narrow window's
  panel sheet keeps it. Whatever writes into the chat (the Toolbox, Cmd+K, the viewer's Add
  to chat, the Overview) brings the chat back from a panel filling the window, as does a question or
  approval the agent waits on and a notification's Open chat (`useShowWaitingChat`), except a hand
  edit's note, which goes in quietly and leaves the keyboard in the view (`viewContext.ts`).
  Engineering with code keeps T3 Code's thread sidebar, with the projects listed in it.
- **Trash.** Move to Trash, in a project's menus (its tile's and the switcher's), is the one way
  to take a project out: its record moves to `<projects folder>/.trash/<id>/project.json` with
  when, and a toast says so with Undo. `studioProjects.list` returns `trashed` beside `projects`,
  so every client hides it the same way (T3 Code's command palette and thread sidebar too, in every
  interface, through `useTrashHiddenFolderKeys`): the project, its folders' chats and the folders
  themselves (not offered as in no project, nor to import) leave Home, Projects, Chats, the
  sidebar and ⌘K (`hiddenByTrash` in `components/workbench/trash/trash.ts`), and every project in
  Trash counts as none, so Home shows its start page. Trash, at the foot of the rail, lists them
  with Restore (back under the same id) and Delete forever, which asks first, deletes its folders'
  T3 projects with their chats (a folder another project holds is kept) and then the record.
  Studio never deletes files on disk: the work folders stay, and so does the project's own
  folder and history in the projects folder, so its id is never reused.
- **Back up.** A project is already a folder on the Mac with its versions in it; the project's
  menu backs it up somewhere else (`components/workbench/BackupDialog.tsx`). GitHub: a private
  repository the server makes for it, then each backup committed and sent whole by
  `apps/server/src/studio/StudioSync.ts`: `main`, every checkpoint and every kept version, so a
  plain push's nearly empty `main` is not all that survives. The token goes in a header for that
  one process (`githubGitAuth.ts`), never in argv or `.git/config`. Before anything leaves it adds
  the missing ignores (`tmp/`, `.studio/compare/`, `__pycache__/`, `.env*`) and stops, naming the
  file, on one over GitHub's 100 MiB in the project or in any version; versions go unchanged, so
  what an old checkpoint already holds under `tmp/` goes with it. Checkpoint refs are forced,
  `main` and kept refs never. Studio sends only to a repository it made, recorded in the folder's
  git config, so a folder with a repository of its own is left to it. Or a
  folder that syncs (a Google Drive, Dropbox or iCloud folder, or a drive): the desktop app copies
  each of the project's folders there, version history (`.git`) included, then only what changed,
  and never deletes from it (`backUp` in `apps/desktop/src/studio/studioImportFiles.ts`). Import
  brings a folder backup back. Not signed in to GitHub is said so, with Set up GitHub (Settings'
  Source control), never the GitHub tool's commands; a finished backup's toast opens it, on
  GitHub or in Finder. Where and when are remembered on this computer and shown under the
  menu (`useBackup.ts`).
- **Quick find.** In Engineering ⌘K finds a project, a part (with its picture), a document or a chat
  in any project (one in another project opens there; with nothing typed, the chats opened lately
  in every project lead, the open one left out, each saying Needs you or Working, so Cmd+K then
  Enter goes back to the chat before, whichever project it is in; then the open project's), or
  any job for the part on screen, with Home, New project, Take the tour, the Library (the examples,
  every document type and skill: what each makes and, where the servo bracket example has one, its
  example; `components/workbench/library/LibraryPage.tsx`), Settings and Trash
  (`components/workbench/StudioQuickFind.tsx`). Engineering with code keeps T3 Code's command
  palette.
- **Getting around.** The top bar is a path, the project then the open chat, the project's name
  opening its Overview (`StudioWorkspaceBar.tsx`). The panel's tabs take Chrome's shortcuts:
  Ctrl+Tab and Ctrl+Shift+Tab go round them, Cmd+1 to 8 to one by its place and Cmd+9 to the last
  (`panelTabShortcuts.ts`, ahead of T3 Code's own Cmd+number), and a file opens in one tab
  however its path was written or whoever opened it (`sameFile.ts`), from a chat link or a part
  mentioned in the composer alike. Cmd+K outside a project opens on Recent (chats and files opened
  lately, as Drive's Recent does; files opened beside a chat are remembered, `recentFiles.ts`). In
  Engineering a document always reads as a document: rendered, with no source view, editor or
  file tree beside it (`FilePreviewPanel.tsx`), and a parts list as a table and a page as a page.
  A file with no viewer of its own (G-code, Gerbers, a schematic, a spreadsheet, a zip) gets a
  page saying what it is, with Open in its own app on this Mac ("Open the spreadsheet"; the
  desktop app opens documents, sheets, drawings and models only, never a script or an app), Show
  in Finder, and its text one press away, read only (`StudioFilePage.tsx`, `aboutFile.ts`); a
  check's result reads as a report. A document has no title block over it in Engineering (its
  first heading is its title), and the Overview's README is typed into where it reads, like a
  document (`ReadmeOverview.tsx`, `replaceReadmeText`). A file chip in the chat shows its kind's
  icon, says what the file is and where on hover, and offers Open and Show in Finder. Studio has
  one name for each thing and one way to do it: new UI reuses the component and the words that
  already exist (Home's New is the toolbar's; Home is "Home" everywhere; the chat says "AI
  agent", as Settings does).
- **Onboarding.** Setup speaks Studio's words and ends at signing in to Claude or Codex
  (`WelcomeWizard.tsx`; Home brings in files). With no projects, Home asks Where would you like to
  start?, with two big buttons, New part and Import a STEP (which opens the one Import menu: Files
  or a folder, Scan this computer), the Start box right under them, then the examples' cards
  (`StartChoices.tsx`, `homeLayout` in `homeStart.ts`). With projects, the examples sit in a Get
  started strip under Starred and Recent, folded away and kept so on this device if you like
  (`studio:get-started-folded`). The Library, on the rail, opens on Examples: every example Studio
  ships, each on a page of its own (`/library/examples/<id>`; the old `/examples` addresses
  redirect), view only: its picture (bundled in `library/pictures/examples/`), What it is from its
  README, what it shows, and Make a copy to edit, which makes a new project of yours ("Phone stand",
  then "Phone stand 2") and opens it, so the example never changes
  (`components/workbench/examples/`). The Library's and New's See the example open the servo
  bracket's page. The first workspace opened gives a five-step tour, once (`StudioTour.tsx`,
  `tourSteps.ts`): the project, its Overview, the tabs, the toolbar and the Toolbox.
- **Chats in no project.** Home's Ask, which made them, is gone (Amy, 2026-10-26: one Start
  box). The chats it made stay: they run in the folder that holds the Studio projects, registered
  as the workspace "No project", and Chats and the sidebar still list them under No project
  (`workbench/freeformChat.ts`). Nothing starts a new one now, so No project is a list of older
  chats that shows only while some remain.
- **One Import menu.** Files or a folder, and Scan this computer, are one component
  (`ImportMenu.tsx`) on Home's start page (the Import a STEP card opens it), Home's Your projects,
  the Projects page and the workspace toolbar, with the same items and names. In a workspace Files
  or a folder copies into that project; elsewhere it makes projects. Dropping files stays where it
  works (`ImportDropZone.tsx`, the Start box).
- **Invite codes.** A friend without ChatGPT uses Codex on Amy's OpenAI key: the first screen's
  Invite code row, under the Claude and Codex cards, so a friend never has to pick Codex (in
  Settings it is AI agents, Codex), paste the code
  (`CodexInviteCode.tsx`, `codexInvite.ts`). The dialog checks the code with Amy's invite server
  (`~/code/studio-invite`, studio-invite.vercel.app, deployed with the Vercel CLI, not on
  GitHub), puts the instance on Studio's own setup for as long as Codex is installed or found (only
  that setup installs Codex), then saves it as an "existing" instance run from that Codex, with
  the server as its provider in launch arguments and the code as a sensitive variable. Stop using
  it puts it back on Studio's own setup. Trap: Codex shows no models from a plain OpenAI model
  list, so the server answers the model list from Codex's own catalog (`npm run catalog` there).
- **The workspace reads like SolidWorks** (Amy, 2026-10-26: "SolidWorks names", as the tools now
  behave as SolidWorks' do; from 2026-10-23 it read in NX's words, "really similar to NX", which the
  command search still finds), its words a display layer over the machinery (`edit/nx.js`), with a
  toolbar laid out as Fusion's: tabs Features, Sketch and Evaluate (Assembly in an assembly, Drawing
  for the part's sheet) with Undo and Redo at the tab row's left, Solid's groups Create, Modify,
  Construct, Inspect and Select, each showing its most-used commands as buttons and the whole group
  in its title's menu; one Extrude (and Revolve, Swept Boss/Base, Lofted Boss/Base) whose Boss/Base
  or Cut switch opens the cut command with what was typed; dialogs with OK, Apply and Cancel at
  their foot (Enter is OK, Escape in the view cancels); a design tree numbering features as
  SolidWorks does (Boss-Extrude1, Fillet1, a renamed one by its name), a box on each to suppress it,
  Equations folded above it, and the Origin with its Front, Top and Right Planes; a row's menu in
  SolidWorks' words (Edit Feature, Edit Sketch, Suppress, Rename, Delete, Rollback, and Roll to End
  while rolled back) and the viewer's warning on the feature a failed build stopped in, told by the
  file, line and words the engine reports (the call into a helper, where the helper raised), and
  nothing marked otherwise, and no timeline along the bottom: the tree is the one history, with its
  rollback bar; the sketch tools as SolidWorks names them (Exit Sketch, Smart
  Dimension, Trim Entities). The script and the agent's notes keep their own names. A purple dot
  marks what the agent made and a grey one what you made, on the design tree's rows; a feature from before Studio kept track has neither (`cad/edit/authors.py`
  records it in the project's `.studio/authors.jsonl`, and only once a chat has run there), and nor
  does any in a repository with linked worktrees, whose checkouts' checkpoints share refs that do
  not say which checkout made them. S finds any button of the toolbar by name, SolidWorks' or
  another tool's ("edge blend" finds Fillet; `edit/CommandSearchBox.jsx`): it lists the viewer's
  commands only, ⌘K stays Studio's find, and AI mode leaves S to the viewer's strip. CAD mode reads
  the part once, quietly, after the model opens, so the full workspace opens on it at once
  (`useEditMode`). A pick in the workspace (a face or an edge on the model, a feature the person
  pressed in the design tree, a sketch picked on the model) with no command open
  offers a small bar beside it (`edit/EditSelectionBar.jsx`, `selectionBar.js`): Quick Edit and
  Edit (Edit Feature, or Edit Sketch; a face has none until the engine says which feature made it).
  A feature a command's OK selected is not a pick, or the bar would stand over the part all the
  while it is worked on. Quick Edit is the same box in both modes: AI mode opens it on any pick, as
  Jake's viewer does, and CAD mode, where a pick is mostly for a command, once the bar's Quick Edit
  asks for it (`useAsked`, the shell's `quickEditAsked`). There the bar gives way to the box; Escape,
  the box's X or a send puts it away, and a written note keeps it open whatever is picked. A feature goes as a
  `text-range` reference to its statement in its script (all its lines, where the engine read the
  statement whole), with a chip named as the design tree names it ("Hole (6)"), the chip's X letting
  go of the pick (`featureAsk.jsx`; the script's absolute path is the engine's `root` with the
  feature's `file`). A face's chip says the feature that made it, "Hole (6) · face 12", where the
  engine does (`cad/edit/face_features.py`: the first feature with a face on the same surface
  that overlaps it; `edit/faceChips.js`), on a part, while the model on screen is the one the engine
  read; any other face keeps its label. Marks drawn on a face go to the agent as shapes in that
  face's own coordinates, in the part's units (`kit/tools/annotate/faceShapes.js`: a mark on one
  face alone, flat on it and all of it over the part; any other stays with the picture and the faces
  it touches; a shape said as what it is on the face, so a rectangle drawn on a face slanted to the
  view is the polygon of its four corners there), as a text part after the references, in every way
  Quick Edit goes.
- **Edit mode in the CAD view.** A model with a part script beside it opens in edit mode, the full
  workspace, and the script stays its source: text-to-cad's own viewer is laid out as a CAD tool,
  with the toolbar across the top, the design tree docked at the left (the part's Equations, its
  features numbered as SolidWorks numbers them, and the selected feature's inputs, each with the
  formula behind it), and the feature's dimensions drawn on the
  model, each changed by a double-click. A change rewrites one number in the script, as it was
  written, and rebuilds every part that uses the file, so the model reloads as any rebuild does; a
  value made of several sizes asks which to change, and a file changed since it was read is refused.
  The view's own tools (Select, Measure, Section View, Exploded View) stay on its strip, in CAD mode
  as in AI, as SolidWorks keeps them on its Heads-up View toolbar, drawn in CAD mode in the
  toolbar's icons (`EFFECT_ICONS` in `xbf/edit/cadIcons.jsx`); the toolbar holds the modeling.
  The toolbar's Create and Modify groups (Hole, Pattern, Mirror; Fillet, Chamfer, Shell) open a
  dialog at the model view's top left, beside the design tree, as SolidWorks' PropertyManager does:
  what the command acts on (the edges or faces selected on the model, Select turned to them as it
  opens; for Mirror and Pattern, the feature picked in the design tree, or the whole body), its
  inputs in the part's units, and OK, Apply and Cancel at its foot. OK writes one line of build123d
  after the statement that makes the part's body, its faces and edges written as build123d's own
  selectors by where they are, never their numbers (the top face's outer edges:
  `tray.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges()`), and the line reads back as a new
  feature, selected, with its inputs to change like any other; a line that does not run, or picks
  something other than the selection, is not written. Undo takes a command's line back. The agent
  hears of each change with the next message (a Hand edit note queued in the composer), never by a
  message of its own. Edit Feature reopens a feature's dialog, Suppress sets one aside, and the
  rollback bar (dragged in the design tree, or put under a feature by Rollback) shows the part as it was above a feature, new features going in there. An assembly
  places its parts, so its toolbar has Assembly and Evaluate only, and its part commands are found by S,
  dimmed: isolate a part (double-click it in the design tree, or Isolate to edit) and the part opens on its own,
  in a tab of its own when the assembly is a project file's tab (`studio/open-file`, a plugin view's
  request to open a file beside the thread). The engine is
  `text-to-cad/packages/cad/src/cad/edit/` (a tracer that runs the script with every number
  remembering where it is written, in a process of its own, behind the viewer's `/api/v1/local/edit/*`
  routes, and `commands.py`, which matches a selection to the part by its geometry and writes a
  command's line); the frame is `text-to-cad/packages/ui/src/renderers/xbf/edit/`. The CAD skill's
  `references/edit-mode.md` tells the agent how to write parts that edit well.
- **The AI | CAD switch.** Studio's bar chooses it where the CAD viewer in front has two layouts. AI
  is the viewer's ai layout, text-to-cad's view exactly as it ships, where a selection opens Quick
  Edit; CAD is the full workspace (edit mode), where the pick bar's Quick Edit opens it. One choice for the person, across
  projects, kept on this device (`studio:simple-view`), AI where none was stored
  (`workbench/simpleView.ts`); New part and Start a part by hand turn it off. The workspace stands
  over the view, one 150 ms fade (none with reduced motion), and the design tree is a column docked
  at the view's left: the canvas starts at its hairline, so the switch is a plain resize of the canvas
  and the camera stays where it was. The viewer says what its part allows (`studio/notifications/edit-state`, to
  a host offering `studioEditState`): a STEP with no part script has one layout, so no toggle shows,
  and a command, sketch or pick open, or a change saving, holds the toggle until it is finished or
  cancelled; a view that closes or opens another file forgets it (`workbench/viewerEditState.ts`). A
  viewer that never sends `edit-state` (one older than its Studio) hides the switch, which is fine
  while Studio and its viewer ship together. The part tabs run along the panel's bottom. The viewer
  takes the layout from its host context (`studio/editLayout`) and then shows no switch of its own;
  elsewhere its navbar keeps the switch, as Manual and AI. The viewer asks for a layout too, with
  `studio/request/edit-layout`, to a host offering `studioEditLayout` (`doubleClickLayout`): in AI a
  double-click on a face steps into CAD on its feature, a plain STEP with no part script or an
  assembly keeps Normal To, and in CAD a double-click on empty space with nothing open goes back to
  AI. In the full workspace, what a command uses is plain: a sketch is picked on the model or in the
  design tree and shaded in the selection blue with its name, an extrude is previewed in amber (a
  cut in red, starting into the part), and a command's dialog floats in a card of its own at the
  model view's top left, beside the design tree, with OK, Apply and Cancel at its foot. One
  generator draws every CAD icon of the workspace, the toolbar's, the design tree's
  and the sketch tools' (`packages/ui/scripts/nx-icons.py`, which writes
  `src/lib/nxIcons.generated.jsx`; a test fails when the committed module is not what it writes);
  chevrons, spinners, close, the amber warning and the sketch overlay's check and cross stay
  lucide's. What edit mode is busy with (reading the part, rolling back, rebuilding) shows with a
  spinner and a line along the toolbar's foot. A rollback step moves the bar at once and, the files
  unchanged, does not run the part again. A hole goes where its face is clicked (a slanted face
  too), a sketch can go on a plane at an Offset distance, a linear pattern takes its direction (X, Y
  or Z) from an edge picked on the model and a circular one its axis from a round face or a straight
  edge, an extrude can end Up To Surface or Up To Vertex, and a revolve and a drafted extrude are
  previewed as they will be made. In a sketch, Convert Entities brings the model's edges in, held On
  Edge so they follow the part as it changes.
- **SolidCraft, on request.** `STUDIO_SOLIDCRAFT=1`, with SolidCraft (a parametric CAD engine,
  Apache-2.0) in Applications, adds `studio-plugins/solidcraft`: its engine headless per thread
  behind an editor page of its own, for `.solidcraft` designs (the overview lists a design and its
  STEP as one part). `STUDIO_SOLIDCRAFT_APP=1` bridges it to the SolidCraft app instead. Bundled
  plugins come from several marketplace folders (`T3CODE_PLUGIN_MARKETPLACE`, separated as PATH is),
  and one whose folder changed is updated at the next start, so its tools and views are listed
  again; one the app stops offering is uninstalled, and offered again if it is offered again.
- **Setup, as a CAD tool shows it.** Under the project's name, its units, material (from a library
  of common grades, or any name typed), process and quantity. Picking a value sends the request
  to the chat ("Change the project's material to PETG."); the agent changes the project's
  `project.json`, which it is told about and may edit, says what the change means for the parts,
  and waits. A folder in no project yet is set up in place. What the project is for and must meet
  is the brief behind Brief.

- **Point, then ask.** What the viewer adds to the chat (Quick Edit's references, a picture of the
  view) lands in the composer, to read and edit before it goes. The viewer is then told the
  context was taken, so the next addition carries only what is new.
- **Mark up anything you can see.** One rule for every file, by what it is:

  | What it is                                       | Opens in           | Moving around                              | Marking up                 |
  | ------------------------------------------------ | ------------------ | ------------------------------------------ | -------------------------- |
  | 3D: parts, assemblies, meshes, results           | the CAD view       | orbit, zoom                                | Pencil, Shapes, Quick Edit |
  | Pages and pictures: every PDF, PNG/JPG/WebP, DXF | the CAD view, flat | scrolls like a PDF; pinch or ⌘-wheel zooms | Pencil, Shapes, Quick Edit |
  | Words: Markdown, parts lists, G-code             | a document         | scrolls                                    | none                       |

  Quick Edit sits on the right, beside what it marks, in every view and at every width; it docks
  at the bottom only on a phone. Pages and pictures are text-to-cad's picture renderer on the flat
  view a DXF uses: an upright page or a stack of them opens at its width with its top in view, a
  landscape sheet opens whole. Quick Edit sends the note with the view itself as a picture, marks
  and all, since nothing draws a PDF again from a snapshot.

- **The Toolbox.** Down the right of the workspace, in AI and in CAD, it is the one place for what
  a part can have done to it: Evaluate, Manufacture and Document, a tab each like SolidWorks'
  CommandManager (the tab left open is remembered on this device), three equal tiles of the
  group's icon (the folded edge's, in its jobs' color) over its name, as the CAD toolbar's
  buttons are, each with a line on what it is
  for (`GROUP_PURPOSES`) over its sections' tiles, split by rules (`StudioToolbox.tsx`).
  Manufacture keeps four sections, not one per process (3D printing, machining and molding, sheet
  metal and cutting, files and off-the-shelf parts), so no heading holds a lone tile that repeats
  it; a pause on a tile shows its name and what it makes (`TooltipRich`). Every job is a tile like every other: within a tab
  nothing is folded away (Amy, 11/04: every skill weighs the same; 11/05: tabs, not one long list). It
  folds to its icons, and starts folded in a narrow panel, in CAD any panel beside a chat, so the
  model keeps the room (`toolboxNarrowRem`); a group's icon opens it on that tab. The jobs the part's kind takes:
  simulations, fit, motion and mass; each way of making it (the project's own first: printing,
  CNC with G-code, sheet metal, cutting, molding, boards), buying standard parts and the files to
  export (STEP, STL and 3MF); drawings, instructions, pictures, reports and robot descriptions.
  Each job says in a line what it makes. A group's everyday sections come first and the rest
  after; Cmd+K finds any job too. Each group ends in What each makes…, which opens the library
  at that group's document types. Each job needs its text-to-cad skill
  (`components/workbench/hardwareActions.ts`) and sends the job, naming the part, to the chat, as
  New's Create does: each prompt asks for what it needs (the loads, the machine), so nothing waits
  on a second press. The composer's / menu offers Studio's own commands in plain words and the
  skills, not the agent's coding commands.
- **Three kinds, and work done on them.** What is designed is CAD, Electronics or Documents, and
  New offers those. FEA and CAM are not kinds of design but work done on one, for parts and boards
  alike, so what Evaluate, Manufacture and Document make (analysis, manufacturing files,
  drawings) belongs to the part it was made from, as a CAD system keeps a study or a toolpath with
  its part. Each kind has one icon wherever it shows: the sidebar, New, the Overview's modules and
  badges, the Toolbox, the quick find and the chat's change chips
  (`components/workbench/kinds.ts`), in one quiet grey on anything you act on: those screens hold
  one accent, the brand blue, and red, amber and green say how a check went. Where files of
  different formats sit together (tabs, file lists, Find, the chat's chips) a file's small mark
  takes a muted hue of its kind (`fileTint`), the icon alone. The CAD ribbon's, tree's and
  timeline's icons are solid pictures in the one blue on darker panels of their own
  (`--cad-ws-panel`), each command a silhouette of its own, and blue shows on the pressed
  command; the rollback bar is grey too, blue only while dragged or focused.
- **Start from a part.** A new thread offers jobs for the project's most recently used parts,
  boards and studies, each kind of job once (a making check, a strength, fit or mass check, a
  document, a way to make it), from the same jobs the Toolbox has;
  a pick goes into the composer to edit before sending (`starterJobs.ts`).
- **A checkout's working copy.** `TEXT_TO_CAD_DEV=1 vpr studio:desktop` runs the checkout's own
  CAD tools instead of the release, so branch work (FEA, CAM, KiCad) reaches Studio: the launcher
  builds the development plugin with the checkout's `scripts/install/dev_install.py`
  (`scripts/studio-dev-plugin.py`) and keeps its state in `~/.text-to-cad-studio-dev`. The
  checkout needs its `.venv` (with the `fea` extra), `npm ci` and `scripts/bundle/bundle.sh`.

A new T3 Code merges in cleanly because Studio adds files rather than editing T3's: an edit to an
upstream file is a seam of a line or a few. Keep it that way: new behaviour goes in new files, and a T3 string or style is changed through `brand/`,
not in place.

## Who the engineering interface is for (Amy, 2026-10-15)

Mechanical engineers who design in SolidWorks, Creo, NX, Fusion or Onshape today, or sketch and
hand the CAD to someone else. Studio is meant to replace that CAD, not sit beside it. What would
prove it: a real product made only in Studio and shipped; a handful of working engineers using it
for a week on their own parts; the same part done in SolidWorks and in Studio, compared.

- **What it owns.** Idea to first model, will-it-make checks, changes from feedback, and the
  documents a shop gets.
- **The unit is a product.** Its parts, assemblies, checks, documents and history together.
  Opening one shows the model with the chat docked, each part's checks, what changed lately and
  the open issues.
- **Steering.** Click a face and ask, mark up a picture, or say it. Exact values are said in chat
  ("make that hole 6.35"), not typed into a table. The code behind a part is there on request,
  one click away.
- **Trust.** A hand check beside every simulation, a source for every number and a list of the
  guesses, the assumptions up front, and a track record: test results logged against a revision,
  a supplier's notes and quotes, and photos of the made part come back in and are compared with
  the model.
- **A failed check.** The agent proposes the fix it recommends, with what it expects it to give,
  as a choice the engineer picks in one click, and waits; it does not change the part on its own.
- **People.** One engineer, a small team editing the same product, and suppliers who see the
  released files and send back notes.
