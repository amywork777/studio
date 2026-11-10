import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentId } from "@t3tools/contracts";

import { parseCheckResult } from "./checkResults";
import type { ProjectModel } from "./projectModels";
import { shownResultOutOfDate } from "./shownResult";
import { folderModelsStore } from "./useFolderModels";
import type { FolderChecks } from "./useProjectChecks";

const ROOT = "/work/bracket";
const ID = "6f1c0d8e-2b7a-4c1e-9d3f-5a6b7c8d9e0f";
const CHECKED = "2026-10-01T12:00:00.000Z";
const seconds = (time: string) => String(Date.parse(time) / 1000);

/** A strength study of the model, written at `written` (no time when the file names none). */
const study = (written?: string) =>
  parseCheckResult(
    "FEA/bracket.fea.json",
    JSON.stringify({
      generator: "cadgen fea",
      document: ID,
      summary: { safety_factor: 6.3, checks: [{ label: "Strength" }] },
      files: { glb: "bracket.fea.glb" },
      findings: [],
    }),
    written,
  )!;

const folders = (written?: string, root = ROOT): ReadonlyArray<FolderChecks> => [
  {
    root,
    paths: ["parts/bracket.py", "FEA/bracket.fea.json", "FEA/bracket.fea.glb"],
    results: [study(written)],
  },
];

/** The folder's model, last built at `updated` (null before the engine has built it). */
const models = (updated: string | null, root = ROOT) =>
  new Map<string, ReadonlyArray<ProjectModel>>([
    [
      root,
      [
        {
          id: ID,
          name: "bracket",
          script: "parts/bracket.py",
          kind: "Part",
          updated: updated === null ? null : seconds(updated),
        },
      ],
    ],
  ]);

const RESULT = `${ROOT}/FEA/bracket.fea.glb`;

describe("a check's result on screen, of a part changed since", () => {
  it("is out of date once its part was built after it was written", () => {
    expect(shownResultOutOfDate(folders(CHECKED), models("2026-10-01T12:05:00.000Z"), RESULT)).toBe(
      true,
    );
  });

  it("is current while its part is as it was checked", () => {
    expect(shownResultOutOfDate(folders(CHECKED), models("2026-10-01T11:00:00.000Z"), RESULT)).toBe(
      false,
    );
  });

  it("says nothing of a result whose file names no time", () => {
    expect(shownResultOutOfDate(folders(), models("2026-10-01T12:05:00.000Z"), RESULT)).toBe(false);
  });

  it("says nothing of a part the engine has not built, or does not list", () => {
    expect(shownResultOutOfDate(folders(CHECKED), models(null), RESULT)).toBe(false);
    expect(shownResultOutOfDate(folders(CHECKED), new Map(), RESULT)).toBe(false);
  });

  it("says nothing of a file that is no check's result", () => {
    expect(shownResultOutOfDate(folders(CHECKED), models("2026-10-01T12:05:00.000Z"), ID)).toBe(
      false,
    );
    expect(
      shownResultOutOfDate(
        folders(CHECKED),
        models("2026-10-01T12:05:00.000Z"),
        `${ROOT}/parts/lid.step`,
      ),
    ).toBe(false);
  });

  it("finds the result in a Windows folder", () => {
    const root = "C:\\work\\bracket";
    expect(
      shownResultOutOfDate(
        folders(CHECKED, root),
        models("2026-10-01T12:05:00.000Z", root),
        "C:\\work\\bracket\\FEA\\bracket.fea.glb",
      ),
    ).toBe(true);
  });

  it("counts a study run on a copy for the part it is about", () => {
    const copy = { ...study(CHECKED), part: "stopped-bracket.step", onStudyCopy: true as const };
    const onCopy: ReadonlyArray<FolderChecks> = [{ ...folders(CHECKED)[0]!, results: [copy] }];
    expect(shownResultOutOfDate(onCopy, models("2026-10-01T12:05:00.000Z"), RESULT)).toBe(true);
    expect(shownResultOutOfDate(onCopy, models("2026-10-01T11:00:00.000Z"), RESULT)).toBe(false);
  });
});

describe("a text-to-cad 0.11 study's result on screen, its part's script edited outside Studio", () => {
  // The wall hook: `cad model solve <id> --study studies/current-refined.json --out
  // studies/current-refined`, its study named for itself, not for the part.
  const root = "/work/wall-hook";
  const env = "env-1" as EnvironmentId;
  const shown = `${root}/studies/current-refined/result.glb`;
  const answer = (path: string) =>
    parseCheckResult(
      "studies/current-refined/result.json",
      JSON.stringify({
        ok: true,
        path,
        findings: [],
        measurements: {
          safety_factor: 27.2,
          checks: [{ kind: "stress", label: "Strength", status: "passes" }],
        },
      }),
      CHECKED,
    )!;
  const checked = (path: string): ReadonlyArray<FolderChecks> => [
    {
      root,
      paths: [
        "parts/hook.py",
        "parts/hook.step",
        "studies/current-refined.json",
        "studies/current-refined/result.json",
        "studies/current-refined/result.glb",
      ],
      results: [answer(path)],
    },
  ];
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("says the part changed once the viewer shows it built again, in no agent's turn", async () => {
    const models = folderModelsStore((flush) => flush());
    // The engine's registry: when it last built the hook.
    let built = Date.parse("2026-10-01T11:00:00.000Z") / 1000;
    const get = async () => ({
      roots: {
        [root]: [{ id: ID, name: "hook", script: "parts/hook.py", kind: "part", updated: built }],
      },
    });
    const read = async () => {
      models.want(env, [root], get);
      await settle();
      return new Map([[root, models.models(env, root)]]);
    };
    // The part's view was on screen as it was checked.
    models.shown(ID, "model:a1");
    expect(shownResultOutOfDate(checked(ID), await read(), shown)).toBe(false);

    // HEIGHT goes from 90 to 85 in an outside editor: nothing is built until the part's view
    // opens, which builds it and syncs its new build.
    built = Date.parse("2026-10-01T12:05:00.000Z") / 1000;
    expect(shownResultOutOfDate(checked(ID), await read(), shown)).toBe(false);
    models.shown(ID, "model:b2");
    expect(shownResultOutOfDate(checked(ID), await read(), shown)).toBe(true);
    // A study of the STEP exported from the hook is the hook's too.
    expect(shownResultOutOfDate(checked(`${root}/parts/hook.step`), await read(), shown)).toBe(
      true,
    );
  });

  it("reads the folders again for a build not heard of yet, and not for the same one", () => {
    const models = folderModelsStore((flush) => flush());
    // A model first on screen may have been built to show it.
    models.shown(ID, "model:a1");
    const first = models.revision();
    expect(first).toBeGreaterThan(0);
    // The next second's sync says the same build.
    models.shown(ID, "model:a1");
    expect(models.revision()).toBe(first);
    // A view that names no build says nothing of one.
    models.shown(ID, "");
    expect(models.revision()).toBe(first);
    models.shown(ID, "model:b2");
    expect(models.revision()).toBe(first + 1);
  });
});
