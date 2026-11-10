import { describe, expect, it } from "vite-plus/test";

import {
  canStart,
  firstChatName,
  nameFirstChatAfterProject,
  nameFromAttachment,
  provisionalProjectName,
  referencePaths,
  setPendingStart,
  startMessage,
  takePendingStart,
} from "./startProject";

describe("provisionalProjectName", () => {
  it("names a project from the start of its description", () => {
    expect(provisionalProjectName("A clip that holds a phone lanyard on my camera strap")).toBe(
      "Clip that holds a phone lanyard",
    );
  });

  it("drops a leading request and a dangling small word", () => {
    expect(provisionalProjectName("I need a bracket for the servo")).toBe("Bracket for the servo");
    expect(provisionalProjectName("Design an enclosure for a sensor board with")).toBe(
      "Enclosure for a sensor board",
    );
  });

  it("keeps to the first sentence", () => {
    expect(provisionalProjectName("Gear guard. It should be cheap.")).toBe("Gear guard");
  });

  it("drops how the description asks, and stops where a new clause starts", () => {
    expect(
      provisionalProjectName(
        "i wanna make a roomba with arms maybe we can mod an existing roomba is it possible? arms to fold clothes",
      ),
    ).toBe("Roomba with arms");
    expect(
      provisionalProjectName(
        "A wall hook that holds my bike up by its front wheel, printed in PETG",
      ),
    ).toBe("Wall hook");
    expect(provisionalProjectName("Can you design a desk lamp arm I can clamp on")).toBe(
      "Desk lamp arm",
    );
    expect(provisionalProjectName("I want to build a cable clip that holds a USB-C cable")).toBe(
      "Cable clip",
    );
    expect(provisionalProjectName("Can opener holder for the kitchen wall")).toBe(
      "Can opener holder",
    );
  });

  it("falls back for an empty description", () => {
    expect(provisionalProjectName("   ")).toBe("New project");
    expect(provisionalProjectName("a")).toBe("New project");
  });
});

describe("takePendingStart", () => {
  it("hands the first message over once", () => {
    setPendingStart("/home/amy/projects/clip", { prompt: "A clip", files: [] });
    expect(takePendingStart("/home/amy/projects/clip/")?.prompt).toBe("A clip");
    expect(takePendingStart("/home/amy/projects/clip")).toBeNull();
  });

  it("keeps each folder's start apart", () => {
    setPendingStart("/p/one", { prompt: "One", files: [] });
    expect(takePendingStart("/p/two")).toBeNull();
    expect(takePendingStart("/p/one")?.prompt).toBe("One");
  });
});

describe("startMessage", () => {
  const files = ["brief/references/Spatula PRD.pdf", "brief/references/Sketches"];
  const SET_UP =
    "Read them all before anything else, then set the project up from them: its name, its units, material, process and quantity where they say, and the README with what it is, its requirements and the decisions they settle. Ask me only what they leave open.";

  it("leaves a one-line start as it is", () => {
    expect(
      startMessage({
        description: " A clip for my lanyard ",
        references: [],
        attached: 0,
        newProject: true,
      }),
    ).toBe("A clip for my lanyard");
  });

  it("sets a new project up from the files copied into its References, read first", () => {
    expect(
      startMessage({
        description: "A spatula for cast iron",
        references: files,
        attached: 0,
        newProject: true,
      }),
    ).toBe(
      [
        "A spatula for cast iron",
        "",
        "My files for it are in the project's References:",
        "- `brief/references/Spatula PRD.pdf`",
        "- `brief/references/Sketches`",
        "",
        SET_UP,
      ].join("\n"),
    );
  });

  it("starts a project from its files alone", () => {
    expect(
      startMessage({ description: "", references: files, attached: 0, newProject: true }),
    ).toBe(
      [
        "Set up this project from my files in its References:",
        "- `brief/references/Spatula PRD.pdf`",
        "- `brief/references/Sketches`",
        "",
        SET_UP,
      ].join("\n"),
    );
  });

  it("names a dozen of many files and counts the rest", () => {
    const many = Array.from({ length: 15 }, (_, at) => `brief/references/photo ${at + 1}.jpg`);
    const lines = startMessage({
      description: "",
      references: many,
      attached: 0,
      newProject: true,
    }).split("\n");
    expect(lines.filter((line) => line.startsWith("- `brief/references/photo"))).toHaveLength(12);
    expect(lines).toContain("- and 3 more in `brief/references/`");
  });

  it("asks a project of yours to read what was added to it", () => {
    expect(
      startMessage({
        description: "Add a hanging hole",
        references: files.slice(0, 1),
        attached: 0,
        newProject: false,
      }),
    ).toBe(
      [
        "Add a hanging hole",
        "",
        "I added these files to the project's References:",
        "- `brief/references/Spatula PRD.pdf`",
        "",
        "Read them before anything else.",
      ].join("\n"),
    );
    expect(
      startMessage({
        description: "",
        references: files.slice(0, 1),
        attached: 0,
        newProject: false,
      }),
    ).toBe(
      [
        "I added these files to the project's References:",
        "- `brief/references/Spatula PRD.pdf`",
        "",
        "Read them, and add what they settle to the README.",
      ].join("\n"),
    );
  });

  it("asks for the files sent with it where none could be copied", () => {
    expect(startMessage({ description: "", references: [], attached: 2, newProject: true })).toBe(
      "Set up this project from the attached files.",
    );
    expect(startMessage({ description: "", references: [], attached: 1, newProject: false })).toBe(
      "Read the attached file.",
    );
  });
});

describe("referencePaths", () => {
  it("gives each copy by its path in the project, as copied, a taken name kept apart", () => {
    expect(
      referencePaths([
        "/Users/amy/studio-projects/spatula/brief/references/Spatula PRD (2).pdf",
        "C:\\Projects\\spatula\\brief\\references\\Sketches",
      ]),
    ).toEqual(["brief/references/Spatula PRD (2).pdf", "brief/references/Sketches"]);
  });
});

describe("nameFromAttachment", () => {
  it("names a project after its first file or folder, as Import does", () => {
    expect(nameFromAttachment("Spatula PRD.pdf")).toBe("Spatula PRD");
    expect(nameFromAttachment("sumo-robot")).toBe("Sumo robot");
    expect(nameFromAttachment("servo_bracket_v2.step")).toBe("Servo bracket v2");
    expect(nameFromAttachment(".step")).toBe("New project");
  });
});

describe("canStart", () => {
  const file = { name: "prd.pdf", path: "/Users/sam/prd.pdf", file: null };

  it("starts from words, from files with no words, and from both", () => {
    expect(canStart("A phone stand", [], false)).toBe(true);
    expect(canStart("", [file], false)).toBe(true);
    expect(canStart("   ", [file], false)).toBe(true);
    expect(canStart("A phone stand", [file], false)).toBe(true);
  });

  it("does not start from nothing, or while another start is under way", () => {
    expect(canStart("", [], false)).toBe(false);
    expect(canStart("   ", [], false)).toBe(false);
    expect(canStart("A phone stand", [], true)).toBe(false);
    expect(canStart("", [file], true)).toBe(false);
  });
});

describe("firstChatName", () => {
  const folder = "/projects/wall-hook-for-a-2-kg-bag";

  it("names a new project's first chat after the project, and again when the agent names it", () => {
    nameFirstChatAfterProject(folder, "Wall hook for a 2 kg bag");
    // Sent: T3's title from the message gives way to the project's name.
    expect(firstChatName(folder, "t1", "Wall hook for a 2 kg bag", "Wall Hook for 2 kg Bag")).toBe(
      "Wall hook for a 2 kg bag",
    );
    // Asked again with nothing changed (a re-render): nothing to do.
    expect(
      firstChatName(folder, "t1", "Wall hook for a 2 kg bag", "Wall hook for a 2 kg bag"),
    ).toBeNull();
    // Another chat in the project keeps its own name.
    expect(firstChatName(folder, "t2", "Wall hook for a 2 kg bag", "Hook strength")).toBeNull();
    // The agent names the project in its first turn: the chat follows once, then is left alone.
    expect(firstChatName(folder, "t1", "Bag wall hook", "Wall hook for a 2 kg bag")).toBe(
      "Bag wall hook",
    );
    expect(firstChatName(folder, "t1", "Wall bracket", "Bag wall hook")).toBeNull();
  });

  it("names no chat in a project Home did not start", () => {
    expect(
      firstChatName("/projects/servo-bracket", "t9", "Servo bracket", "Fix the holes"),
    ).toBeNull();
  });
});
