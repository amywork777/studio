import { expect } from "e2e";

import { test, WEB } from "./t3.ts";

test("Studio files a manufacturing preview as a CAM plan", WEB, async ({ t3, app, screen }) => {
  const project = await t3.project("Machining preview", {
    "manufacturing/cam-preview/result.json": JSON.stringify({
      path: "parts/plate.step",
      findings: [],
      measurements: { verdict: { status: "ready", headline: "Ready to cut" } },
    }),
  });
  const thread = await t3.thread({ project, title: "Preview", messages: ["first"] });
  await t3.open(thread);
  await expect(screen.getByText("Cam preview", { exact: true })).toBeVisible();
  await app.screenshot("manufacturing-result");
  await expect(screen.getByText("CAM plan", { exact: true })).toBeVisible();
});
