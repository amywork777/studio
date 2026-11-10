import { describe, expect, it } from "vite-plus/test";

import { fileTemplate, templateFiles } from "./documentTemplates";
import { DOCUMENT_TEMPLATES, newWorkPrompt } from "./newTemplates";

const work = {
  name: "PRD",
  folder: "docs",
  units: "mm" as const,
  part: null,
  description: "It is for nursing homes.",
};

describe("document templates", () => {
  it("writes a built-in document with its sections, guessing nothing", () => {
    const prd = DOCUMENT_TEMPLATES.find((template) => template.id === "prd")!;
    const prompt = newWorkPrompt({ ...work, template: prd });
    expect(prompt).toMatch(
      /^Write the product requirements document \(PRD\) for this project as docs\/prd\.md, with these sections: Summary; The problem and who has it;/,
    );
    expect(prompt).toContain("write what is not known yet as an open question, not a guess.");
    expect(prompt.endsWith(" It is for nursing homes.")).toBe(true);
  });

  it("writes a document from the person's own template, following the file", () => {
    const template = fileTemplate("/Users/x/studio-projects/Templates/client_PRD_v2.docx");
    expect(template.label).toBe("Client PRD v2");
    expect(
      newWorkPrompt({
        ...work,
        name: "Spatula PRD",
        description: "",
        template,
        templateLink: "[client_PRD_v2.docx](/Users/x/studio-projects/Templates/client_PRD_v2.docx)",
      }),
    ).toBe(
      "Write Spatula PRD for this project as docs/spatula_prd.md, following the template [client_PRD_v2.docx](/Users/x/studio-projects/Templates/client_PRD_v2.docx) section by section: its order, its headings, and its tables with their columns and row numbers. It is a Word file: read its text first (on a Mac, `textutil -convert txt -stdout` on it; on Windows, a .docx is a zip with its text in word/document.xml). Fill each from the project's brief, its parts, their checks and the decisions in its README; write what is not known yet as an open question, not a guess.",
    );
  });

  it("names a template after its file, keeping a name like xRD as written", () => {
    const template = fileTemplate("/Users/x/studio-projects/Templates/DS_template_xRD_20261019.md");
    expect(template.label).toBe("DS template xRD 20261019");
    expect(
      newWorkPrompt({ ...work, name: "Spatula xRD", description: "", template }),
    ).not.toContain("Word file");
  });

  it("offers the folder's own files as templates, not hidden ones or nested ones", () => {
    expect(templateFiles(["b.md", ".DS_Store", "old/a.md", "A design review.docx"])).toEqual([
      "A design review.docx",
      "b.md",
    ]);
  });
});
