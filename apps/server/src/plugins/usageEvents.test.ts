import { describe, expect, it } from "vite-plus/test";

import { cadUsageEvent } from "./usageEvents.ts";

const post = (url: string) => ({
  name: "cad_http",
  arguments: { method: "POST", url, body: "e30=" },
});
const answered = (status: number) => ({ structuredContent: { status, body: "" } });

describe("cadUsageEvent", () => {
  it("names what an engineer did by a fixed event, with no path or query", () => {
    expect(
      cadUsageEvent("tools/call", post("/api/v1/local/edit/change"), answered(200)),
    ).toStrictEqual({ event: "cad.hand_edit" });
    expect(
      cadUsageEvent("tools/call", post("/api/v1/local/versions/compare?path=a.py"), answered(200)),
    ).toStrictEqual({ event: "cad.versions.compared" });
    expect(cadUsageEvent("tools/call", post("/api/v1/documents"), answered(201))).toStrictEqual({
      event: "cad.model.opened",
    });
  });

  it("counts a model opened once, not each time it is asked while still reading", () => {
    expect(cadUsageEvent("tools/call", post("/api/v1/documents"), answered(202))).toBeNull();
  });

  it("counts an action the CAD server refused or failed by the action it was", () => {
    expect(
      cadUsageEvent("tools/call", post("/api/v1/local/edit/change"), answered(500)),
    ).toStrictEqual({ event: "cad.action.failed", properties: { action: "cad.hand_edit" } });
    expect(
      cadUsageEvent("tools/call", post("/api/v1/local/sizes/set?path=a.py"), answered(409)),
    ).toStrictEqual({ event: "cad.action.failed", properties: { action: "cad.size.changed" } });
  });

  it("does not count reads, other routes, other tools or unanswered requests", () => {
    const get = { name: "cad_http", arguments: { method: "GET", url: "/api/v1/local/sizes" } };
    expect(cadUsageEvent("tools/call", get, answered(200))).toBeNull();
    expect(cadUsageEvent("tools/call", post("/api/v1/local/pick"), answered(200))).toBeNull();
    expect(cadUsageEvent("tools/call", { name: "cad_home" }, answered(200))).toBeNull();
    expect(cadUsageEvent("tools/call", post("/api/v1/local/pick"), answered(500))).toBeNull();
    expect(cadUsageEvent("tools/call", post("/api/v1/local/edit/change"), {})).toBeNull();
    expect(cadUsageEvent("tools/list", {}, {})).toBeNull();
  });
});
