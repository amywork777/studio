import { describe, expect, it } from "vite-plus/test";

import { splitForReferences } from "./attachToReferences";

const prd = { name: "PRD.pdf", type: "application/pdf" };
const sheet = { name: "bearing.xlsx", type: "" };
const photo = { name: "photo.png", type: "image/png" };
const pathOf = (file: { readonly name: string }) => `/home/me/${file.name}`;

describe("splitForReferences", () => {
  it("copies a PRD or a data sheet in and keeps a picture in the chat", () => {
    const { copied, filedByAgent, chat } = splitForReferences([prd, sheet, photo], pathOf);
    expect(copied.map((entry) => entry.path)).toEqual([
      "/home/me/PRD.pdf",
      "/home/me/bearing.xlsx",
    ]);
    expect(filedByAgent).toEqual([]);
    expect(chat).toEqual([photo]);
  });

  it("leaves what has no path on this computer for the agent to file", () => {
    const { copied, filedByAgent, chat } = splitForReferences([prd, photo], () => null);
    expect(copied).toEqual([]);
    expect(filedByAgent).toEqual([prd]);
    expect(chat).toEqual([photo]);
  });

  it("files pictures too from the Brief", () => {
    const { copied, chat } = splitForReferences([photo], pathOf, "references");
    expect(copied.map((entry) => entry.file)).toEqual([photo]);
    expect(chat).toEqual([]);
  });
});
