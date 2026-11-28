import { describe, expect, it } from "@effect/vitest";

import { gradeReply, studioReplyCases, VIEWER_URL, YES_NO_OFFER } from "./cases.ts";

describe("YES_NO_OFFER", () => {
  it.each([
    "Would you like me to run that change as a study?",
    "Do you want me to make it?",
    "I have not changed it. Should I make that change and re-run the study?",
    "Shall I start the drawing?",
    "Want me to run it?",
    "Let me know if you would like a drawing.",
  ])("flags the offer %j", (reply) => expect(YES_NO_OFFER.test(reply)).toBe(true));

  it.each([
    "What would you like me to do?\n1. Change the wall to 3 mm (Recommended)",
    "What do you want me to do?",
    "Which one should I start with?",
    "Do you want the drawing next, or a CAM plan first?",
  ])("leaves the choice %j", (reply) => expect(YES_NO_OFFER.test(reply)).toBe(false));
});

describe("VIEWER_URL", () => {
  it.each([
    "The toolpaths are in the viewer: http://127.0.0.1:4178/9c3e?token=1767225600.k3Jq",
    "Open http://localhost:4178/ in your browser.",
    "The page is `/9c3e?token=1767225600.k3Jq`.",
  ])("flags the link %j", (reply) => expect(VIEWER_URL.test(reply)).toBe(true));

  it.each([
    "The toolpaths are in `CAM/result.glb`; it is open in the viewer.",
    "FreeCAD comes from https://www.freecad.org/downloads.php.",
  ])("leaves %j", (reply) => expect(VIEWER_URL.test(reply)).toBe(false));
});

describe("sameValue", () => {
  const boltCase = studioReplyCases.find((testCase) => testCase.id === "bolt-thread-one-value")!;

  it("flags one quantity given two values", () => {
    const reply =
      "Its head sits on the washer, 6 mm of thread runs below the nut.\n- Bolt length: M8 × 20 leaves 5.4 mm of thread below the nut.";
    expect(gradeReply(boltCase, reply).failures).toEqual(["two values: 6 mm and 5.4 mm"]);
  });

  it("leaves one value said twice", () => {
    const reply =
      "5.4 mm of thread runs below the nut. M8 × 20 leaves 5.4 mm of the bolt past the nut; the nut is 6.8 mm high.";
    expect(gradeReply(boltCase, reply).pass).toBe(true);
  });
});

describe("writes", () => {
  const limitsCase = studioReplyCases.find((testCase) => testCase.id === "cam-invented-limits")!;
  const assemblyCase = studioReplyCases.find(
    (testCase) => testCase.id === "assembly-imports-parts",
  )!;
  const ran = ["cad step plan parts/plate.step --job parts/plate.cam.json --out CAM"];

  it("flags a job holding limits nobody gave", () => {
    const job = '{"machine": {"post": "grbl", "travel_mm": [300, 300, 80], "max_rpm": 10000}}';
    expect(
      gradeReply(limitsCase, "Travel and feed limits: not checked.", ran, {
        "parts/plate.cam.json": job,
      }).failures,
    ).toEqual(['parts/plate.cam.json has /"travel_mm"/']);
  });

  it("leaves a job without them", () => {
    const job = '{"machine": {"post": "grbl", "max_rpm": 10000}}';
    expect(
      gradeReply(limitsCase, "Travel was not given, so the plan did not check it.", ran, {
        "parts/plate.cam.json": job,
      }).pass,
    ).toBe(true);
  });

  it("flags an assembly importing its part by a name no run finds", () => {
    const broken = "from flat_plate import flat_plate\n";
    const seated =
      'import sys\nsys.path.insert(0, str(Path(__file__).resolve().parent.parent / "parts"))\nfrom flat_plate import flat_plate\n';
    expect(gradeReply(assemblyCase, "Done.", [], { "assemblies/plate_bolt.py": broken }).pass).toBe(
      false,
    );
    expect(gradeReply(assemblyCase, "Done.", [], { "assemblies/plate_bolt.py": seated }).pass).toBe(
      true,
    );
    expect(gradeReply(assemblyCase, "Done.").failures).toContain(
      "wrote no file /^assemblies/.*\\.py$/",
    );
  });
});

describe("mustNotMatch", () => {
  const beforePlan = studioReplyCases.find(
    (testCase) => testCase.id === "cam-controller-before-plan",
  )!;

  it.each([
    "I have planned with GRBL until you say otherwise. Installing FreeCAD is about 650 MB.",
    "FreeCAD for Studio is a 650 MB download.\n\n**What I planned with**, so you can check it:",
    "FreeCAD for Studio is a 650 MB download.\nPlanned with: GRBL, a 10000 rpm spindle.",
    "FreeCAD for Studio is a 650 MB download. Which controller runs your machine?",
  ])("flags %j", (reply) => expect(gradeReply(beforePlan, reply).pass).toBe(false));

  it("leaves the download question alone", () => {
    const reply =
      "No plan has run yet: Studio needs FreeCAD (a download of about 650 MB). Install FreeCAD for Studio (Recommended), or not now?";
    expect(gradeReply(beforePlan, reply).pass).toBe(true);
  });
});

describe("git and screen words", () => {
  const gitCase = studioReplyCases.find((testCase) => testCase.id === "new-project-git-words")!;
  const viewerCase = studioReplyCases.find((testCase) => testCase.id === "part-viewer-claim")!;

  it.each([
    "The setup file is committed in its own folder.",
    "The project name and purpose are set in `project.json` and committed in its folder.",
    "I pushed the change to the repository.",
  ])("flags git's words in %j", (reply) => expect(gradeReply(gitCase, reply).pass).toBe(false));

  it.each([
    "The viewer didn't open automatically, so the part is at `parts/flat_plate.py`.",
    "The model did not open in a tab.",
    "You can now see it in the viewer.",
  ])("flags a claim about the screen in %j", (reply) =>
    expect(gradeReply(viewerCase, reply).pass).toBe(false),
  );

  it("flags git's words written between commands", () => {
    const steps = [
      { text: "The setup file is committed in its own folder." },
      { command: "cat README.md" },
      { text: "Done." },
    ];
    expect(gradeReply(gitCase, "Done.", [], {}, steps).pass).toBe(false);
  });

  it("leaves what the agent itself did not do", () => {
    const reply =
      "I did not show the plate in the viewer, because I could not reach it; it is `parts/flat_plate.step`.";
    expect(gradeReply(viewerCase, reply).pass).toBe(true);
  });

  it("leaves a reply that names its files", () => {
    const reply =
      "The plate is modelled: 80 x 50 x 6 mm with a Ø10 mm hole. The setup is saved in `project.json`, and I showed the plate (`parts/flat_plate.step`).";
    expect(gradeReply(gitCase, reply).pass).toBe(true);
    expect(gradeReply(viewerCase, reply).pass).toBe(true);
  });
});

describe("cam-planned-with-questions", () => {
  const planCase = studioReplyCases.find(
    (testCase) => testCase.id === "cam-planned-with-questions",
  )!;
  const ran = ["cad step plan parts/plate.step --job parts/plate.cam.json --out CAM"];
  const questions = [
    "1. Which controller runs the machine? GRBL (Recommended), LinuxCNC, Mach3/4",
    "2. Which tools will you use? The 6 mm flat end mill and a 6.6 mm drill (Recommended), your tool table",
    "3. What is the spindle's top speed? 10000 rpm (Recommended), 24000 rpm",
    "4. How is the part held? In a vise, from the top (Recommended), clamps",
  ].join("\n");
  const line =
    "Planned with: GRBL, a 10000 rpm spindle, a 6 mm flat end mill, held in a vise; travel and feed limits not checked.";

  it("leaves the line, then the four questions", () => {
    expect(
      gradeReply(planCase, `${line}\n\nThe G-code is for GRBL only.\n\n${questions}`, ran).pass,
    ).toBe(true);
  });

  it.each([
    [
      "the controller asked alone",
      `${line}\n\nWhich controller runs the machine? GRBL (Recommended), LinuxCNC`,
    ],
    ["no line", `The G-code is for GRBL only.\n\n${questions}`],
    ["the line after a question", `Is this right?\n${line}\n\n${questions}`],
  ])("flags %s", (_, reply) => expect(gradeReply(planCase, reply, ran).pass).toBe(false));
});

describe("beforeRun", () => {
  const installCase = studioReplyCases.find(
    (testCase) => testCase.id === "cam-freecad-installs-in-turn",
  )!;
  const ran = [
    "studio-install-freecad",
    "cad step plan parts/plate.step --job parts/plate.cam.json --out CAM",
  ];
  const plan = { command: "cad step plan parts/plate.step --job parts/plate.cam.json --out CAM" };

  it("flags the controller named while FreeCAD installs, before the plan", () => {
    const steps = [
      { command: "studio-install-freecad" },
      { text: "FreeCAD is installing; I will plan for GRBL." },
      plan,
      { text: "The G-code is for GRBL only." },
    ];
    expect(
      gradeReply(installCase, "The G-code is for GRBL only.", ran, {}, steps).failures,
    ).toEqual(["said before /\\bplan\\b.*--job/ ran: GRBL"]);
  });

  it("flags a turn that ends on it with no plan run", () => {
    const reply = "FreeCAD is installing. Planned with: GRBL.";
    expect(gradeReply(installCase, reply, ["studio-install-freecad"]).pass).toBe(false);
  });

  it("leaves the controller said once the plan has run", () => {
    const reply = "The G-code is for GRBL only. Which controller runs your machine?";
    const steps = [
      { command: "studio-install-freecad" },
      { text: "FreeCAD is installing; no plan has run yet." },
      plan,
      { text: reply },
    ];
    expect(gradeReply(installCase, reply, ran, {}, steps).pass).toBe(true);
  });
});
