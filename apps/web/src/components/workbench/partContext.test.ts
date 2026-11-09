import { describe, expect, it } from "vite-plus/test";

import {
  buildPollUrl,
  cadHttpArguments,
  describePart,
  documentOf,
  partBuild,
  readBuild,
  readDocumentKind,
  readDocumentName,
  readOpenedDocument,
  documentApi,
  readMaterials,
  readTunnelJson,
  readUpdated,
  readViewSync,
  sharedLoad,
} from "./partContext";

const MODEL = "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90";

const tunnel = async (value: unknown, gzip = false) => {
  let bytes = new TextEncoder().encode(JSON.stringify(value));
  if (gzip) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return {
    structuredContent: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: btoa(String.fromCharCode(...bytes)),
      ...(gzip ? { encoding: "gzip" } : {}),
    },
  };
};

describe("describePart", () => {
  it("reads a mesh in a study's folder as its result, not a part to make", () => {
    const root = "/Users/me/results/flexure-case";
    expect(describePart(`${root}/studies/tray/refined.glb`, null, null, root).kind).toBe("Result");
    expect(describePart(`${root}/FEA/tray.lid-press.glb`, null, null, root).kind).toBe("FEA study");
    expect(describePart("studies/plate.stl", null).kind).toBe("Result");
    // The study's folder is the project's, not one of the folders the project sits in.
    expect(describePart(`${root}/parts/tray.glb`, null, null, root).kind).toBe("Mesh");
    expect(describePart(`${root}/parts/tray.glb`, null).kind).toBe("Mesh");
    expect(describePart(`${root}/studies/tray.step`, null, null, root).kind).toBe("Part");
  });

  it("names a model by the name the engine gives it, a part or an assembly as its parts say", () => {
    expect(describePart(MODEL, "part", "servo_bracket")).toEqual({
      name: "Servo bracket",
      kind: "Part",
      units: "mm",
    });
    expect(describePart(MODEL, "assembly", "arm").kind).toBe("Assembly");
    // Before its document is read it is a part, by no name of its own yet.
    expect(describePart(MODEL, null)).toMatchObject({ kind: "Part", units: "mm" });
    expect(describePart("/work/plate.xbf", "part").kind).toBe("Part");
  });

  it("names a STEP after its file and says part or assembly as its document does", () => {
    expect(describePart("/work/servo_bracket.step", "part")).toEqual({
      name: "Servo bracket",
      kind: "Part",
      units: "mm",
    });
    expect(describePart("/work/arm.STEP", "assembly").kind).toBe("Assembly");
  });

  it("names a result after the model it came from", () => {
    expect(describePart("/work/bracket.fea.glb", null)).toEqual({
      name: "Bracket",
      kind: "FEA study",
      units: "mm",
    });
    expect(describePart("/work/plate.cam.glb", null).kind).toBe("CAM job");
    expect(describePart("/work/mesh.glb", null).kind).toBe("Mesh");
  });

  it("names a 0.11 result after the folder it was written into", () => {
    expect(describePart("/work/studies/tip-load/result.glb", null, null, "/work")).toEqual({
      name: "Tip load",
      kind: "FEA study",
      units: "mm",
    });
    expect(describePart("/work/CAM/result.glb", null, null, "/work")).toEqual({
      name: "Result",
      kind: "CAM job",
      units: "mm",
    });
  });

  it("gives boards millimetres, robots metres, and a drawing or schematic none", () => {
    expect(describePart("/b/main.kicad_pcb", null)).toMatchObject({ kind: "Board", units: "mm" });
    expect(describePart("/b/main.kicad_sch", null).units).toBeNull();
    expect(describePart("/r/arm.urdf", null).units).toBe("m");
    expect(describePart("/d/panel.dxf", null).units).toBeNull();
  });

  it("keeps a file it does not know by its whole name", () => {
    expect(describePart("C:\\work\\notes.txt", null)).toEqual({
      name: "notes.txt",
      kind: "File",
      units: null,
    });
  });
});

describe("readViewSync", () => {
  const sync = (args: Record<string, unknown>, reply: Record<string, unknown> = {}) => ({
    pluginId: "text-to-cad",
    server: "cad",
    name: "cad_sync",
    arguments: { view: "v1", surface: "thread", ...args },
    result: { content: [], structuredContent: { events: [], ...reply } },
  });

  it("reads the document a view shows, a file's path or a model's id, and the catalog's revision", () => {
    expect(
      readViewSync(
        sync(
          { model: "/work/bracket.step", state: { revision: "7" } },
          { catalog: { revision: "c41" } },
        ),
      ),
    ).toEqual({
      pluginId: "text-to-cad",
      server: "cad",
      path: "/work/bracket.step",
      revision: "c41",
    });
    expect(readViewSync(sync({ model: MODEL }, { catalog: { revision: "c42" } }))).toMatchObject({
      path: MODEL,
      revision: "c42",
    });
  });

  it("falls back to the viewer's revision, which it reports as a string", () => {
    const shown = readViewSync(sync({ model: "/work/mesh.stl", state: { revision: "12" } }));
    expect(shown).toMatchObject({ revision: "12" });
  });

  it("ignores the home, a closing view and every other call", () => {
    expect(readViewSync(sync({ model: null }))).toBeNull();
    expect(readViewSync(sync({ model: "/work/a.step", closed: true }))).toBeNull();
    expect(readViewSync({ ...sync({ model: "/work/a.step" }), name: "cad_http" })).toBeNull();
  });
});

describe("the engine's document", () => {
  it("is a model's by its id, a STEP's or an xbf's by the id the engine answers for it, else none", () => {
    expect(documentOf(MODEL)).toEqual({ id: MODEL });
    expect(documentOf("/work/bracket.STEP")).toEqual({ file: "/work/bracket.STEP" });
    expect(documentOf("/work/XBF/plate.xbf")).toEqual({ file: "/work/XBF/plate.xbf" });
    expect(documentOf("/work/mesh.stl")).toBeNull();
    const opened = { id: "f-1", kind: "step", api: "/api/v1/documents/step/f-1" };
    expect(readOpenedDocument(opened)).toEqual({ id: "f-1", kind: "step" });
    expect(documentApi({ id: "f-1", kind: "step" })).toBe("/api/v1/documents/step/f-1");
    // Still being read (202): no document yet, though its id is known.
    expect(readOpenedDocument({ ...opened, state: "reading", retryMs: 250 })).toBeNull();
  });

  const structure = (children: number, materials: ReadonlyArray<string | null>) => ({
    name: "rig",
    tree:
      children === 0
        ? { name: "rig", prototype: 0, instance: 0 }
        : {
            name: "rig",
            children: Array.from({ length: children }, (_, index) => ({
              name: `p${index}`,
              prototype: 0,
            })),
          },
    prototypes: materials.map((name, index) => ({
      index,
      key: `k${index}`,
      name: `p${index}`,
      material: name === null ? null : { name, density: 2.7 },
    })),
    instances: Array.from({ length: Math.max(children, 1) }, (_, index) => ({
      prototype: 0,
      path: `rig/p${index}`,
    })),
  });

  it("is an assembly when more than one part is placed, as the engine counts", () => {
    expect(readDocumentKind(structure(0, [null]))).toBe("part");
    // A model of one solid: the engine gives the root that solid as its one child.
    expect(readDocumentKind(structure(1, [null]))).toBe("part");
    expect(readDocumentKind(structure(3, [null, null]))).toBe("assembly");
    expect(readDocumentKind(null)).toBeNull();
    expect(readDocumentName(structure(0, [null]))).toBe("rig");
  });

  it("lists the named materials its parts are made of, once each", () => {
    expect(readMaterials(structure(3, ["Aluminium 6061", "ABS", "Aluminium 6061", null]))).toEqual([
      "Aluminium 6061",
      "ABS",
    ]);
    expect(readMaterials(structure(1, [null]))).toEqual([]);
  });
});

describe("readBuild", () => {
  it("reports a model's build in flight or failed as the news, in the build's own words", () => {
    expect(
      readBuild({ version: "3-1", building: { phase: "running" }, failed: null }, 1000, true),
    ).toEqual({
      state: "building",
    });
    expect(
      readBuild(
        { version: "3-1", building: null, failed: { model: "plate", error: "fillet failed" } },
        1000,
        true,
      ),
    ).toEqual({ state: "failed", error: "fillet failed" });
  });

  it("dates a model by its last build and a file by its own time, from Recents' updated", () => {
    const current = { version: "3-1", building: null, failed: null };
    expect(readBuild(current, 1_700_000_000_000, true)).toEqual({
      state: "built",
      at: 1_700_000_000_000,
    });
    expect(readBuild(current, 2000, false)).toEqual({ state: "saved", at: 2000 });
    expect(readBuild(null, 2000, false)).toEqual({ state: "saved", at: 2000 });
    expect(readBuild(null, null, true)).toBeNull();
  });
});

describe("a shown model's build, as it happens", () => {
  it("asks at once first, then for the next move past the version and progress last heard", () => {
    expect(buildPollUrl(MODEL, null)).toBe(`/api/v1/documents/${MODEL}/version?wait=20`);
    expect(buildPollUrl(MODEL, { version: "3-1", building: null, failed: null, progress: 4 })).toBe(
      `/api/v1/documents/${MODEL}/version?wait=20&after=3-1&progress=4`,
    );
  });

  it("says a build in flight, and a failed one that kept the version before it, over when it was built", () => {
    const read = {
      version: { version: "3-1", building: null, failed: null, progress: 4 },
      updated: 9000,
    };
    expect(partBuild(null, read, true)).toEqual({ state: "built", at: 9000 });
    const building = { version: "3-1", building: { phase: "building" }, failed: null, progress: 5 };
    expect(partBuild(building, read, true)).toEqual({ state: "building" });
    // The engine still holds 3-1: the revision never moved, and the failure is the news.
    const failed = {
      version: "3-1",
      building: null,
      failed: { model: "plate", error: "fillet failed" },
      progress: 6,
    };
    expect(partBuild(failed, read, true)).toEqual({ state: "failed", error: "fillet failed" });
    // A build that succeeds after it: built again.
    const rebuilt = { version: "3-2", building: null, failed: null, progress: 8 };
    expect(partBuild(rebuilt, { ...read, updated: 9500 }, true)).toEqual({
      state: "built",
      at: 9500,
    });
    expect(partBuild(null, null, true)).toBeNull();
  });
});

describe("readUpdated", () => {
  it("finds the document in Recents, a model by its id, and converts seconds to milliseconds", () => {
    const recents = {
      documents: [
        { path: "/work/bracket.step", kind: "file", updated: 1_700_000_000 },
        { path: MODEL, id: MODEL, kind: "model", updated: 1_700_000_100.5 },
      ],
    };
    expect(readUpdated(recents, "/work/bracket.step")).toBe(1_700_000_000_000);
    expect(readUpdated(recents, MODEL)).toBe(1_700_000_100_500);
    expect(readUpdated(recents, "/work/other.step")).toBeNull();
    // cadgen 0.7's `modified` is no time cadgen 0.8 gives.
    expect(
      readUpdated({ documents: [{ path: "/w/a.step", modified: 5 }] }, "/w/a.step"),
    ).toBeNull();
  });
});

describe("readTunnelJson", () => {
  it("reads a cad_http body, gzipped or not", async () => {
    expect(await readTunnelJson(await tunnel({ entries: [] }))).toEqual({ entries: [] });
    expect(await readTunnelJson(await tunnel({ entries: [{ kind: "part" }] }, true))).toEqual({
      entries: [{ kind: "part" }],
    });
  });

  it("is null for a route that did not answer 200, or 201 for a document opened", async () => {
    expect(
      await readTunnelJson({ structuredContent: { status: 404, headers: {}, body: "" } }),
    ).toBeNull();
    const opened = { id: "f-1", kind: "step" };
    const answered = async (status: number) => {
      const reply = await tunnel(opened);
      return readTunnelJson({ structuredContent: { ...reply.structuredContent, status } });
    };
    expect(await answered(201)).toEqual(opened);
    // Still reading: asked again later, never read as the document.
    expect(await answered(202)).toBeNull();
  });
});

describe("cadHttpArguments", () => {
  it("is a GET, or a POST of JSON carrying the viewer's guard", () => {
    expect(cadHttpArguments("/api/v1/documents")).toEqual({
      method: "GET",
      url: "/api/v1/documents",
    });
    const post = cadHttpArguments("/api/v1/documents", { path: "/w/é.step" });
    expect(post.headers).toEqual({ "content-type": "application/json", "x-cad-viewer": "1" });
    const bytes = Uint8Array.from(atob(post.body ?? ""), (char) => char.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({ path: "/w/é.step" });
  });
});

describe("sharedLoad", () => {
  it("runs one load for callers asking while it runs, and a fresh one after it settles", async () => {
    const inFlight = new Map<string, Promise<number>>();
    let loads = 0;
    let finish: (value: number) => void = () => undefined;
    const load = () => {
      loads += 1;
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    };
    const first = sharedLoad(inFlight, "bracket.step\n3", load);
    const second = sharedLoad(inFlight, "bracket.step\n3", load);
    expect(loads).toBe(1);
    finish(7);
    expect(await Promise.all([first, second])).toEqual([7, 7]);
    const later = sharedLoad(inFlight, "bracket.step\n3", () => Promise.resolve(8));
    expect(await later).toBe(8);
  });

  it("loads each key on its own", () => {
    const inFlight = new Map<string, Promise<string>>();
    let loads = 0;
    const load = () => {
      loads += 1;
      return new Promise<string>(() => undefined);
    };
    void sharedLoad(inFlight, "a", load);
    void sharedLoad(inFlight, "b", load);
    expect(loads).toBe(2);
  });
});
