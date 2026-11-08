import { describe, expect, it } from "vite-plus/test";

import { viewerLinkModel } from "./viewerLink";

const ID = "0dc50a92-a21f-5895-a245-ebdeb5352f3b";

describe("viewerLinkModel", () => {
  it("reads the model from the page the CAD tools print", () => {
    expect(viewerLinkModel(`http://127.0.0.1:54360/${ID}?token=abc`)).toBe(ID);
    expect(viewerLinkModel(`http://localhost:54360/${ID}`)).toBe(ID);
  });

  it("leaves every other link alone", () => {
    expect(viewerLinkModel(`https://example.com/${ID}`)).toBeNull();
    expect(viewerLinkModel("http://127.0.0.1:5173/settings")).toBeNull();
    expect(viewerLinkModel(`http://127.0.0.1:54360/api/${ID}`)).toBeNull();
    expect(viewerLinkModel("parts/bracket.step")).toBeNull();
  });
});
