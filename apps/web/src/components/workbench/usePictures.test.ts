import { describe, expect, it } from "vite-plus/test";

import { wantsPicture } from "./usePictures";

describe("wantsPicture", () => {
  const picture = { picture: "data:image/png;base64,AA", at: 1_000 };

  it("asks for a picture it does not have", () => {
    expect(wantsPicture(undefined, false, 1_000)).toBe(true);
  });

  it("asks again after a while for a file that came back with none", () => {
    expect(wantsPicture({ picture: null, at: 1_000 }, false, 2_000)).toBe(false);
    expect(wantsPicture({ picture: null, at: 1_000 }, false, 21_000)).toBe(true);
  });

  it("keeps a file's picture for a moment, then lets the server say if the file changed", () => {
    expect(wantsPicture(picture, false, 2_000)).toBe(false);
    expect(wantsPicture(picture, false, 31_000)).toBe(true);
  });

  it("keeps a model's picture for its build", () => {
    expect(wantsPicture(picture, true, 1_000_000)).toBe(false);
  });
});
