// @effect-diagnostics nodeBuiltinImport:off - reads the CAD service's build limit from its Python source.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it, vi } from "vite-plus/test";

import {
  type BuiltPart,
  buildPart,
  CAD_BUILD_TIMEOUT_S,
  PART_BUILD_MS,
  freePartStem,
  makeNewPart,
  partStem,
  starterScript,
  UNTITLED_PART,
  untitledName,
} from "./newPart";

describe("untitledName", () => {
  it("names the first new part's project Untitled part", () => {
    expect(untitledName([])).toBe(UNTITLED_PART);
    expect(untitledName(["Servo bracket"])).toBe("Untitled part");
  });

  it("numbers the next past every name taken, Trash's too, whatever their case", () => {
    expect(untitledName(["Untitled part"])).toBe("Untitled part 2");
    expect(untitledName(["untitled part", "Untitled Part 2", "Servo bracket"])).toBe(
      "Untitled part 3",
    );
  });
});

describe("a new part's file", () => {
  it("is named as a file name, kept clear of the names its script needs", () => {
    expect(partStem("Part")).toBe("part");
    expect(partStem("Shelf bracket")).toBe("shelf_bracket");
    expect(partStem("2nd bracket")).toBe("part_2nd_bracket");
    expect(partStem("step")).toBe("part_step");
    expect(partStem("model")).toBe("part_model");
    expect(partStem("class")).toBe("part_class");
    expect(partStem("  ")).toBe("part");
  });

  it("is kept clear of the modules its build imports, which a file beside it would stand in for", () => {
    expect(partStem("Platform")).toBe("part_platform");
    expect(partStem("copy")).toBe("part_copy");
    expect(partStem("Logging")).toBe("part_logging");
    expect(partStem("numpy")).toBe("part_numpy");
    expect(partStem("Platform bracket")).toBe("platform_bracket");
  });

  it("takes the next name free beside the parts already there", () => {
    expect(freePartStem("part", [])).toBe("part");
    expect(freePartStem("part", ["parts/part.py", "parts/part.step"])).toBe("part_2");
    expect(freePartStem("part", ["parts/Part.STEP", "parts/part_2.py"])).toBe("part_3");
    expect(freePartStem("bracket", ["parts/part.py"])).toBe("bracket");
  });
});

describe("the starter part", () => {
  const script = starterScript("part");

  it("is a CAD model: build123d itself, the model decorator on one function, run when the script is", () => {
    expect(script).toContain("import build123d as bd");
    expect(script).toContain("from cad import model");
    expect(script).not.toContain("from cad import build123d");
    expect(script).toMatch(/^@model\ndef part\(\):$/m);
    expect(script).toMatch(/^if __name__ == "__main__":\n {4}part\(\)$/m);
  });

  it("names its sizes at the top and sketches one block from them", () => {
    const sizes = [...script.matchAll(/^([A-Z][A-Z_]*) = (\d+(?:\.\d+)?)$/gm)].map(
      (match) => match[1],
    );
    expect(sizes).toEqual(["LENGTH", "WIDTH", "HEIGHT"]);
    expect(script.indexOf("HEIGHT =")).toBeLessThan(script.indexOf("@model"));
    expect(script).toContain('Sketch("Sketch1", plane="Top")');
    expect(script).toContain("sketch1.rectangle(sketch1.origin, (LENGTH, WIDTH))");
    expect(script).toContain("bd.extrude(sketch1.face(), amount=HEIGHT)");
  });

  it("is named for its file: its function and its label", () => {
    const named = starterScript("shelf_bracket");
    expect(named).toMatch(/^def shelf_bracket\(\):$/m);
    expect(named).toContain('body.label = "shelf_bracket"');
    expect(named).toMatch(/^ {4}shelf_bracket\(\)$/m);
  });
});

describe("a new part's first build", () => {
  const id = "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90";
  /** Studio's CAD service as a list of replies, in order, recording what it was asked. */
  function service(replies: ReadonlyArray<unknown>) {
    const asked: Array<{ path: string; body: unknown }> = [];
    let next = 0;
    const post = async (path: string, body: unknown) => {
      asked.push({ path, body });
      return replies[next++] ?? null;
    };
    return { asked, post };
  }
  const run = (post: (path: string, body: unknown) => Promise<unknown>) =>
    buildPart({ post, script: "/p/parts/part.py", wait: async () => {} });

  it("asks for the build, then answers the document's id once it is built", async () => {
    const cad = service([
      { ok: true, document: id, building: {} },
      { ok: true, editable: true, document: id, partBuilt: false, partBuilding: true },
      { ok: true, editable: true, document: id, partBuilt: true, partBuilding: false },
    ]);
    expect(await run(cad.post)).toEqual<BuiltPart>({ id });
    expect(cad.asked).toEqual([
      { path: "/api/v1/local/edit/change", body: { file: "/p/parts/part.py", build: true } },
      { path: "/api/v1/local/edit/state", body: { file: "/p/parts/part.py", probe: true } },
      { path: "/api/v1/local/edit/state", body: { file: "/p/parts/part.py", probe: true } },
    ]);
  });

  it("answers a failed build's own error, and never an id to open", async () => {
    const cad = service([
      { ok: true, document: id },
      {
        ok: true,
        document: id,
        partBuilt: false,
        partBuilding: false,
        partError: "part.py: NameError: name 'LENGHT' is not defined",
      },
    ]);
    expect(await run(cad.post)).toEqual({
      error: "part.py: NameError: name 'LENGHT' is not defined",
    });
  });

  it("says so when the service can't be asked, or the build ended without a part", async () => {
    expect(await run(service([null]).post)).toEqual({
      error: "Studio's CAD service did not answer.",
    });
    expect(
      await run(service([{ ok: false, error: "This model has no part script to change." }]).post),
    ).toEqual({ error: "This model has no part script to change." });
    expect(
      await run(service([{ ok: true }, { ok: true, partBuilt: false, partBuilding: false }]).post),
    ).toEqual({ error: "The build ended without a part." });
  });

  it("waits as long as the CAD service lets one build run, and a little more", () => {
    const python = NodeFS.readFileSync(
      NodePath.join(
        import.meta.dirname,
        ...Array.from({ length: 5 }, () => ".."),
        "text-to-cad/packages/cad/src/cad/edit/service.py",
      ),
      "utf8",
    );
    expect(CAD_BUILD_TIMEOUT_S).toBe(Number(/^BUILD_TIMEOUT = (\d+)$/m.exec(python)?.[1]));
    expect(PART_BUILD_MS).toBeGreaterThan(CAD_BUILD_TIMEOUT_S * 1000);
    expect(PART_BUILD_MS).toBeLessThanOrEqual((CAD_BUILD_TIMEOUT_S + 60) * 1000);
  });

  it("gives up on a build that outlasts the CAD service's own limit", async () => {
    let clock = 0;
    const building = { ok: true, partBuilt: false, partBuilding: true };
    const cad = service([{ ok: true }, ...Array.from({ length: 20 }, () => building)]);
    const built = await buildPart({
      post: cad.post,
      script: "/p/parts/part.py",
      wait: async () => {
        clock += 100_000;
      },
      now: () => clock,
    });
    expect(built).toEqual({ error: "The part took too long to build." });
    // Asked every 100 seconds while the limit had not passed (0 to 900), then once past its 930.
    expect(cad.asked.filter((ask) => ask.path === "/api/v1/local/edit/state")).toHaveLength(
      Math.ceil(PART_BUILD_MS / 100_000) + 1,
    );
  });
});

describe("New part, step by step", () => {
  const id = "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90";
  const written = async (folder: string) => `${folder}/parts/part.py`;
  /** New part's steps, recording what was opened and said; `write` is the starter's write. */
  function run(
    write: (folder: string) => Promise<string>,
    names: ReadonlyArray<string> = [],
    builds: ReadonlyArray<BuiltPart> = [{ id }],
  ) {
    const seen: string[] = [];
    let next = 0;
    const done = makeNewPart<string>({
      names: async () => names,
      create: async ({ name, onFolder, show }) => {
        seen.push(`made ${name}`);
        await onFolder("/projects/untitled-part");
        show("chat");
        return true;
      },
      writeStarter: write,
      build: async (ref, script) => {
        seen.push(`built ${script} for ${ref}`);
        return builds[next++] ?? { id };
      },
      openPart: (ref, part) => seen.push(`${part} beside ${ref}`),
      openProject: (ref) => seen.push(`overview beside ${ref}`),
      failed: (title, error, retry) => {
        seen.push(`${title}: ${(error as Error).message}`);
        // Its Build again, pressed once.
        if (retry !== undefined && next === 1) retry();
      },
    });
    return done.then(() => seen);
  }

  it("opens the project at once, builds its part, then swaps to it by its id", async () => {
    expect(await run(written, ["Untitled part"])).toEqual([
      "made Untitled part 2",
      "overview beside chat",
      "built /projects/untitled-part/parts/part.py for chat",
      `${id} beside chat`,
    ]);
  });

  it("stays on the project and says the build's error, with Build again, when its part doesn't build", async () => {
    const seen = await run(written, [], [{ error: "part.py: the build failed" }, { id }]);
    // Build again's own build settles after `makeNewPart` does.
    await vi.waitFor(() =>
      expect(seen).toEqual([
        "made Untitled part",
        "overview beside chat",
        "built /projects/untitled-part/parts/part.py for chat",
        "Made Untitled part, but its part did not build: part.py: the build failed",
        "built /projects/untitled-part/parts/part.py for chat",
        `${id} beside chat`,
      ]),
    );
  });

  it("keeps the project when its starter can't be written, opens it, and says so", async () => {
    expect(
      await run(async () => {
        throw new Error("parts/part.py could not be written.");
      }),
    ).toEqual([
      "made Untitled part",
      "overview beside chat",
      "Made Untitled part, but its starter part could not be written: parts/part.py could not be written.",
    ]);
  });

  it("makes nothing when the names can't be read", async () => {
    const seen: string[] = [];
    await makeNewPart<string>({
      names: async () => {
        throw new Error("Studio's projects could not be read.");
      },
      create: async () => {
        seen.push("made");
        return true;
      },
      writeStarter: written,
      build: async () => ({ id }),
      openPart: () => {},
      openProject: () => {},
      failed: (title, error) => seen.push(`${title}: ${(error as Error).message}`),
    });
    expect(seen).toEqual(["Could not make the part: Studio's projects could not be read."]);
  });
});
