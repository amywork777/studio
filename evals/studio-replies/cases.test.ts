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
