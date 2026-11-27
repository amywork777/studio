import { describe, expect, it } from "@effect/vitest";

import { YES_NO_OFFER } from "./cases.ts";

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
