import { describe, expect, it } from "vite-plus/test";

import type { CheckResult } from "./checkResults";
import { projectStatus, statusWords } from "./projectStatus";

const result = (status: CheckResult["status"], part: string): CheckResult => ({
  path: `${part}.fea.json`,
  model: `${part}.glb`,
  part,
  check: "Strength",
  status,
  headline: "",
  issues: [],
});

describe("the Overview's status strip", () => {
  it("counts only what the runs wrote, and says Not checked when none ran", () => {
    const none = projectStatus({ results: [], waiting: 0 });
    expect(none.checked).toBe(false);
    expect(statusWords(none)).toEqual([{ tone: "none", text: "Not checked" }]);
  });

  it("says how the checks went, failures first, and how many chats wait", () => {
    const status = projectStatus({
      results: [result("fix", "arm"), result("warnings", "base"), result("ready", "head")],
      waiting: 2,
    });
    expect(status).toEqual({ failed: 1, warnings: 1, passed: 1, checked: true, waiting: 2 });
    expect(statusWords(status).map((word) => word.text)).toEqual([
      "1 check failed",
      "1 warning",
      "1 passed",
    ]);
  });
});
