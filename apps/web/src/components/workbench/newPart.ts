/**
 * The engine never builds a model because a view opened it, so New part writes the script, builds
 * it through Studio's CAD service, and opens its document by id once that build is done.
 */

import { copyName } from "./examples/examples";
import { fileStem } from "./newTemplates";
import type { CadPost } from "./useVersions";

/** What a new part's project is called until it is renamed: "Untitled part", "Untitled part 2". */
export const UNTITLED_PART = "Untitled part";

/** Where a new part goes in its project's folder, as New's Part has it. */
export const PART_FOLDER = "parts";

/**
 * The name for a new part's project: "Untitled part", else the next one free among `existing`,
 * every project's name and Trash's, so a restore never makes two of one name.
 */
export function untitledName(existing: ReadonlyArray<string>): string {
  return copyName(UNTITLED_PART, existing);
}

/** Names a part's script can't take: the names it imports, and a module it would hide. */
const TAKEN_BY_SCRIPT = new Set(["bd", "model", "step", "cad", "cadgen", "build123d", "sizes"]);
/**
 * Modules a part's build imports by name: a script runs with its folder first on the path, so a
 * part named `platform` or `copy` would stand in for Python's own and break its build. Python's
 * standard library (`sys.stdlib_module_names`, those a file name can be) and build123d's packages.
 */
const PYTHON_MODULES = new Set(
  (
    "abc annotationlib antigravity argparse array ast asyncio atexit base64 bdb binascii bisect " +
    "builtins bz2 calendar cmath cmd code codecs codeop collections colorsys compileall " +
    "compression concurrent configparser contextlib contextvars copy copyreg csv ctypes curses " +
    "dataclasses datetime dbm decimal difflib dis doctest email encodings ensurepip enum errno " +
    "faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc genericpath " +
    "getopt getpass gettext glob graphlib grp gzip hashlib heapq hmac html http idlelib imaplib " +
    "importlib inspect io ipaddress itertools json keyword linecache locale logging lzma mailbox " +
    "marshal math mimetypes mmap modulefinder msvcrt multiprocessing netrc nt ntpath nturl2path " +
    "numbers opcode operator optparse os pathlib pdb pickle pickletools pkgutil platform " +
    "plistlib poplib posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc " +
    "pydoc_data pyexpat queue quopri random re readline reprlib resource rlcompleter runpy sched " +
    "secrets select selectors shelve shlex shutil signal site smtplib socket socketserver " +
    "sqlite3 sre_compile sre_constants sre_parse ssl stat statistics string stringprep struct " +
    "subprocess symtable sys sysconfig syslog tabnanny tarfile tempfile termios textwrap this " +
    "threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty turtle " +
    "turtledemo types typing unicodedata unittest urllib uuid venv warnings wave weakref " +
    "webbrowser winreg winsound wsgiref xml xmlrpc zipapp zipfile zipimport zlib zoneinfo " +
    "numpy scipy ocp ocpsvg ezdxf anytree trimesh sympy svgpathtools webcolors typing_extensions"
  ).split(" "),
);
const PYTHON_KEYWORDS = new Set(
  "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
    " ",
  ),
);

/**
 * A part's file name from what it is called ("Shelf bracket" is `shelf_bracket`), which is its
 * function's name too: one a Python function can have, and not one its script already uses.
 */
export function partStem(name: string): string {
  const stem = fileStem(name);
  if (stem === "untitled") return "part";
  return /^\d/.test(stem) ||
    TAKEN_BY_SCRIPT.has(stem) ||
    PYTHON_KEYWORDS.has(stem) ||
    PYTHON_MODULES.has(stem)
    ? `part_${stem}`
    : stem;
}

/**
 * `stem`, else `stem_2`, `stem_3`... : the first whose script and STEP are both free among the
 * folder's files (`taken`, paths as its listing gives them), so a new part never writes over one.
 */
export function freePartStem(stem: string, taken: ReadonlyArray<string>): string {
  const used = new Set(
    taken.flatMap((path) => {
      const match = /([^/\\]+)\.(?:py|step|stp)$/i.exec(path);
      return match === null ? [] : [match[1]!.toLowerCase()];
    }),
  );
  if (!used.has(stem)) return stem;
  for (let count = 2; ; count++) {
    if (!used.has(`${stem}_${count}`)) return `${stem}_${count}`;
  }
}

/**
 * `stem` names the function and its label, as the script's file is named; the function's name and
 * the script's path are its document id.
 */
export function starterScript(stem: string): string {
  return `"""A new part: one block, sketched on the Top plane and extruded. Change its sizes here or in CAD
mode, and add its features there. Origin: a corner of its underside, +Z up."""

import build123d as bd
from cad import model
from cad.sketch import Sketch

LENGTH = 40.0
WIDTH = 20.0
HEIGHT = 10.0


@model
def ${stem}():
    sketch1 = Sketch("Sketch1", plane="Top")
    line1, line2, line3, line4 = sketch1.rectangle(sketch1.origin, (LENGTH, WIDTH))
    sketch1.length(line1, LENGTH)
    sketch1.length(line2, WIDTH)
    body = bd.extrude(sketch1.face(), amount=HEIGHT)
    body.label = "${stem}"
    return body


if __name__ == "__main__":
    ${stem}()
`;
}

/** A part's first build: its document's id to open, or why there is none. */
export type BuiltPart = { readonly id: string } | { readonly error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The CAD service's own limit on one build, in seconds: `BUILD_TIMEOUT` in
 * text-to-cad's `cad/edit/service.py`, which stops a build that runs longer (a test holds the two
 * equal).
 */
export const CAD_BUILD_TIMEOUT_S = 900;
/** How long a first build may take: the CAD service's own limit on one build, and a little more. */
export const PART_BUILD_MS = (CAD_BUILD_TIMEOUT_S + 30) * 1000;
const PART_BUILD_POLL_MS = 500;

/**
 * Builds a part's script (`script`, absolute) through Studio's CAD service, edit mode's builds
 * (`cad/edit/service.py`, `change` with `build`), and waits until its document is built
 * (`partBuilt`) or its build failed (`partError`, in the build's own words). `wait` is the pause
 * between asks.
 */
export async function buildPart(input: {
  readonly post: CadPost;
  readonly script: string;
  readonly wait?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}): Promise<BuiltPart> {
  const wait = input.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? Date.now;
  const said = (reply: unknown, otherwise: string) =>
    isRecord(reply) && typeof reply.error === "string" && reply.error !== ""
      ? reply.error
      : otherwise;
  const asked = await input.post("/api/v1/local/edit/change", { file: input.script, build: true });
  if (!isRecord(asked) || asked.ok !== true) {
    return { error: said(asked, "Studio's CAD service did not answer.") };
  }
  const deadline = now() + PART_BUILD_MS;
  for (;;) {
    const probe = await input.post("/api/v1/local/edit/state", { file: input.script, probe: true });
    if (!isRecord(probe) || probe.ok !== true) {
      return { error: said(probe, "Studio's CAD service did not answer.") };
    }
    if (typeof probe.partError === "string") return { error: probe.partError };
    if (probe.partBuilt === true && typeof probe.document === "string") {
      return { id: probe.document };
    }
    if (probe.partBuilding !== true) return { error: "The build ended without a part." };
    if (now() >= deadline) return { error: "The part took too long to build." };
    await wait(PART_BUILD_POLL_MS);
  }
}

/**
 * A starter that can't be written or doesn't build leaves the project made, on its Overview;
 * `failed` says why, with `retry`. Resolves once the part is open, or has said why not.
 */
export async function makeNewPart<Ref>(steps: {
  /** Every project's name, and Trash's. */
  readonly names: () => Promise<ReadonlyArray<string>>;
  readonly create: (input: {
    readonly name: string;
    readonly onFolder: (folder: string) => Promise<void>;
    readonly show: (ref: Ref) => void;
  }) => Promise<boolean>;
  /** Writes the starter into the project's folder, and answers its script's absolute path. */
  readonly writeStarter: (folder: string) => Promise<string>;
  readonly build: (ref: Ref, script: string) => Promise<BuiltPart>;
  /** Opens the part's document in CAD mode beside the chat. */
  readonly openPart: (ref: Ref, id: string) => void;
  /** Opens the project's Overview beside the chat. */
  readonly openProject: (ref: Ref) => void;
  readonly failed: (title: string, error: unknown, retry?: () => void) => void;
}): Promise<void> {
  let name: string;
  try {
    name = untitledName(await steps.names());
  } catch (error) {
    steps.failed("Could not make the part", error);
    return;
  }
  // Set by the folder's step and the chat's, read once the project is made.
  const starter: { script: string | null; error: unknown; chat: { readonly ref: Ref } | null } = {
    script: null,
    error: null,
    chat: null,
  };
  try {
    await steps.create({
      name,
      onFolder: async (folder) => {
        try {
          starter.script = await steps.writeStarter(folder);
        } catch (error) {
          starter.error = error;
        }
      },
      show: (ref) => {
        starter.chat = { ref };
        steps.openProject(ref);
      },
    });
  } catch (error) {
    steps.failed("Could not make the part", error);
    return;
  }
  const opened = starter.chat;
  const script = starter.script;
  if (script === null) {
    if (starter.error !== null) {
      steps.failed(`Made ${name}, but its starter part could not be written`, starter.error);
    }
    return;
  }
  if (opened === null) return;
  await buildThenSwap({
    ref: opened.ref,
    script,
    failedTitle: `Made ${name}, but its part did not build`,
    build: steps.build,
    openPart: steps.openPart,
    failed: steps.failed,
  });
}

/**
 * What there is is opened first, then the script is built and its document swapped in once the
 * build lands. A failed build leaves what was opened and says why, with `retry`. Resolves once the
 * document is open, or has said why not.
 */
export async function buildThenSwap<Ref>(steps: {
  readonly ref: Ref;
  /** The model's script, absolute. */
  readonly script: string;
  readonly failedTitle: string;
  readonly build: (ref: Ref, script: string) => Promise<BuiltPart>;
  readonly openPart: (ref: Ref, id: string) => void;
  readonly failed: (title: string, error: unknown, retry?: () => void) => void;
}): Promise<void> {
  const built = await steps.build(steps.ref, steps.script);
  if ("id" in built) {
    steps.openPart(steps.ref, built.id);
    return;
  }
  steps.failed(steps.failedTitle, new Error(built.error), () => {
    void buildThenSwap(steps);
  });
}
