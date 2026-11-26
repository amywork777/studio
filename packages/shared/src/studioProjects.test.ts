import type { StudioProject } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_STUDIO_BRIEF,
  studioOtherFolders,
  studioProjectAt,
  studioConceptsFolder,
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
    expect(context).toContain("- `robots/`: robot descriptions (URDF, SRDF)");
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

  it("sets every drawing to the project's standard, units and tolerance, with the person's name", () => {
    // A project made before the drawing settings: ISO, the usual tolerance, no name invented.
    const before = studioProjectContext(rover, "/work/rover-cad");
    expect(before).toContain('`profile=GENERIC`, `projection="FIRST ANGLE"`');
    expect(before).toContain('`units="mm"`');
    expect(before).toContain('`general_tolerance="ISO 2768-m"`');
    expect(before).toContain("Company: not set; leave `company` empty");
    expect(before).toContain("Drawn by: not set; leave `author` empty");

    const inch = {
      ...rover,
      brief: { ...rover.brief, units: "in" as const, standard: "ASME" as const },
    };
    const context = studioProjectContext(inch, "/work/rover-cad", null, {
      company: 'Rover "Works"',
      drawnBy: "A. Engineer",
    });
    expect(context).toContain('`profile=Profile("ASME", "ASME Y14.5-2018")`');
    expect(context).toContain('`projection="THIRD ANGLE"`');
    expect(context).toContain('`units="in"`');
    expect(context).toContain('`general_tolerance="±.005"`');
    expect(context).toContain('`company="Rover \\"Works\\""`');
    expect(context).toContain('`author="A. Engineer"`');

    const stated = { ...inch, brief: { ...inch.brief, generalTolerance: "±.010" } };
    expect(studioProjectContext(stated, "/work/rover-cad")).toContain(
      '`general_tolerance="±.010"`',
    );
  });

  it("asks the agent to keep the README's decisions and to start a new project with a draft, not questions", () => {
    const concepts = studioConceptsFolder("/studio/", "rover", "thread-1");
    expect(concepts).toBe("/studio/rover/brainstorm/thread-1");
    const context = studioProjectContext(
      rover,
      "/work/rover-cad",
      "/studio/rover/project.json",
      null,
      concepts,
    );
    // A chat's concepts stay out of the project until the person uses one.
    expect(context).toContain(
      "go in `/studio/rover/brainstorm/thread-1`, never in the project's folders",
    );
    expect(studioProjectContext(rover, "/work/rover-cad")).not.toContain("## Concepts");
    expect(context).toContain("## The README");
    expect(context).toContain("`## Decisions`");
    expect(context).toContain("(<YYYY-MM-DD>, asked)");
    expect(context).toContain("`- Support the bike by its front wheel (2026-10-19, asked)`");
    expect(context).toContain("Studio shows every section, folded to its heading");
    // Open questions as taps: the format `readQuestion` reads (`projectReadme.ts`).
    expect(context).toContain("`- <question> [<what you assumed> | <another answer>]`");
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

  it("has the agent record a trade's project as that trade's, which then drops the machinist's tolerance", () => {
    const fresh = studioProjectContext(rover, "/work/rover-cad", "/studio/rover/project.json");
    expect(fresh).toContain("set `brief.industry` to it there");
    expect(fresh).toContain("`packaging` for a box, carton, sleeve or mailer, or its dieline");
    expect(fresh).toContain('`industry` is one of\n"apparel", "packaging"');
    expect(fresh).not.toContain("- Industry:");

    const carton = { ...rover, brief: { ...rover.brief, industry: "packaging" } };
    const context = studioProjectContext(carton, "/work/rover-cad");
    expect(context).toContain("- Industry: Packaging; work with the `packaging` skill");
    expect(context).not.toContain("general_tolerance=");
    expect(context).toContain("packaging works to its own allowances");
    // A tolerance the person stated still holds; a trade Studio does not know is none.
    const stated = { ...carton, brief: { ...carton.brief, generalTolerance: "±0.5 mm" } };
    expect(studioProjectContext(stated, "/work/rover-cad")).toContain(
      '`general_tolerance="±0.5 mm"`',
    );
    const unknown = { ...rover, brief: { ...rover.brief, industry: "aerospace" } };
    expect(studioProjectContext(unknown, "/work/rover-cad")).not.toContain("- Industry:");
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
