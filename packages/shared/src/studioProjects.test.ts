import type { StudioProject } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_STUDIO_BRIEF,
  studioOtherFolders,
  studioProjectAt,
  studioProjectContext,
} from "./studioProjects.ts";

const rover: StudioProject = {
  name: "Rover arm",
  template: "robot",
  brief: {
    ...EMPTY_STUDIO_BRIEF,
    purpose: "A three-joint arm for the rover deck.",
    material: "6061-T6 aluminum",
    process: "CNC machining",
  },
  folders: ["/work/rover-cad", "/work/rover-board/", "/work/rover-firmware"],
  createdAt: "2026-10-14T00:00:00.000Z",
};

describe("studio projects", () => {
  it("finds a folder's project whatever trailing slash either side has", () => {
    expect(studioProjectAt({ a: rover }, "/work/rover-board")?.id).toBe("a");
    expect(studioProjectAt({ a: rover }, "/work/rover-cad/")?.project.name).toBe("Rover arm");
    expect(studioProjectAt({ a: rover }, "/work/rover")).toBeNull();
    expect(studioOtherFolders(rover, "/work/rover-board")).toEqual([
      "/work/rover-cad",
      "/work/rover-firmware",
    ]);
  });

  it("tells the agent the folders, marks its own, and leaves out what the brief does not say", () => {
    const context = studioProjectContext(rover, "/work/rover-firmware");
    expect(context).toContain("# Studio project: Rover arm");
    expect(context).toContain("- `/work/rover-firmware` (this thread's folder)");
    expect(context).toContain("- `/work/rover-cad`\n");
    expect(context).toContain("Work in mm");
    expect(context).toContain("- Material: 6061-T6 aluminum");
    expect(context).toContain("- Quantity: Not decided");
    expect(context).toContain("In `/work/rover-cad`, keep the project's work");
    expect(context).toContain("- `robots/`: robot descriptions (URDF, SRDF, SDF)");
    expect(context).not.toContain("## Requirements");
    expect(context).toContain("## Show your work");
    expect(context).toContain("## References");
    expect(context).toContain("`brief/references/`");
    // An engineer hears about the design, not the tools: Studio keeps a version every turn.
    expect(context).toContain("## Talking to the person");
    expect(context).toContain("never offer to commit");
    expect(context).toContain("## Sketches the person can edit");
    expect(context).toContain(
      "Draw every 2D profile you extrude, revolve, cut, sweep or loft with `cad.sketch`",
    );
    expect(context).toContain("Call parts and documents by their names");
    expect(context).toContain("round them up in a short report in `docs/`");
    expect(studioProjectContext({ ...rover, template: "blank" }, "/work/rover-cad")).not.toContain(
      "## Where work goes",
    );
    expect(context).not.toContain("## Changing the setup");
  });

  it("asks the agent to keep the README's decisions and to start a new project with a draft, not questions", () => {
    const context = studioProjectContext(rover, "/work/rover-cad", "/studio/rover/project.json");
    expect(context).toContain("## The README");
    expect(context).toContain("`## Decisions`");
    expect(context).toContain("(<YYYY-MM-DD>, asked)");
    expect(context).toContain("`- Support the bike by its front wheel (2026-10-19, asked)`");
    expect(context).toContain("Studio shows every section, folded to its heading");
    expect(context).toContain("write short points, not paragraphs");
    expect(context).toContain("## Starting a project");
    expect(context).toContain("as `name` in `/studio/rover/project.json`");
    // What the Overview's "What it is" shows until the README says: a sentence, not the request.
    expect(context).toContain("as `brief.purpose`, never the description's own words");
    // The first part takes the project's name, so its tab and the switcher read one name.
    expect(context).toContain("Name the first part after the project");
    expect(context).toContain("make the first draft in the same turn, without asking first");
    expect(context).toContain("list what you assumed");
    expect(context).not.toContain("before the first draft");
    expect(context).toContain("before any research or modelling");
    expect(context).toContain("a printer named means 3D printing");
    expect(context).toContain("add its decision line to the README in the same turn");
    expect(studioProjectContext(rover, "/work/rover-cad")).not.toContain("as `name` in");
    // Every question carries the answer the agent recommends; a failed check comes with a fix.
    expect(context).toContain("## Questions and recommendations");
    expect(context).toContain("marked (Recommended)");
    expect(context).toContain("Never ask an open question without a default.");
    expect(context).toContain("offer the choices with none marked (Recommended)");
    expect(context).toContain("propose the fix you would make with what you expect it to give");
    expect(context).toContain("offer the next one it leads to");
    expect(context).toContain("run that check in the same turn rather than only recording it");
    expect(context).toContain("When the description gives a load, run the strength check");
    expect(studioProjectContext(rover, "/work/rover-cad")).toContain(
      "- Write `README.md` as above",
    );
  });

  it("tells the agent where the setup is kept, and to update the parts a setup change clearly affects", () => {
    const context = studioProjectContext(rover, "/work/rover-cad", "/studio/rover/project.json");
    expect(context).toContain("## Changing the setup");
    expect(context).toContain("kept in `/studio/rover/project.json`");
    expect(context).toContain('"Casting"');
    expect(context).toContain("Then update the parts the\nchange clearly affects in the same turn");
    expect(context).not.toContain("wait\nfor a go before changing any part");
  });

  it("tells the agent how to cite", () => {
    const context = studioProjectContext(rover, "/work/rover-cad");
    expect(context).toContain("## Sources\n\nWhen you answer a question about this project, mark");
    expect(context).toContain(
      "numbered in the order you first cite them. End the answer with a block that starts with a line reading exactly `Sources:`, one source a line:\n" +
        "[1] path/to/file.py:12-18\n" +
        "[2] docs/prd.md#The heading\n" +
        "[3] https://example.com/page\n" +
        "[4] own knowledge: what it is\n" +
        "Cite only what you opened in this chat. A claim from your own knowledge, such as a standard you know but did not open, is cited as own knowledge. " +
        "Studio shows the sources under your answer and marks any it cannot find among what you opened.\n",
    );
    // After the way of showing work, before the README's.
    expect(context.indexOf("## Sources")).toBeGreaterThan(context.indexOf("## Show your work"));
    expect(context.indexOf("## Sources")).toBeLessThan(context.indexOf("## The README"));
  });
});
