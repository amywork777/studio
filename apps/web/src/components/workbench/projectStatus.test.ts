import { describe, expect, it } from "vite-plus/test";

import type { CheckResult } from "./checkResults";
import { projectStatus, statusWords, tileCheckBadge } from "./projectStatus";

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
  it("counts only what the runs wrote, and shows nothing when none ran", () => {
    const none = projectStatus({ results: [], waiting: 0 });
    expect(none.checked).toBe(false);
    expect(statusWords(none)).toEqual([]);
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

describe("a Home tile's check badge", () => {
  const result = (check: string, status: "fix" | "warnings" | "ready") => ({ check, status });
  it("says the worst check, a failure before a warning, counting several", () => {
    expect(tileCheckBadge([result("Printing", "warnings"), result("Strength", "ready")])).toEqual({
      tone: "warning",
      text: "Printing: passes with warnings",
    });
    expect(tileCheckBadge([result("Printing", "warnings"), result("Strength", "fix")])).toEqual({
      tone: "failed",
      text: "Strength: failed",
    });
    expect(tileCheckBadge([result("Strength", "fix"), result("Casting", "fix")])?.text).toBe(
      "2 checks failed",
    );
  });

  it("says nothing when every check passed or none ran", () => {
    expect(tileCheckBadge([result("Strength", "ready")])).toBeNull();
    expect(tileCheckBadge([])).toBeNull();
  });
});
