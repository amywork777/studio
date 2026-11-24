import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { PinnedProjectTab } from "./PinnedProjectTab";

const TIP = "Overview, everything in the project";

describe("the pinned Overview tab", () => {
  it("says what it is on hover, not when Studio moves focus to it", async () => {
    await using screen = await render(
      <PinnedProjectTab active view="project" withSource={false} onSelect={() => {}} />,
    );
    const tab = screen.getByRole("button", { name: "Overview" });
    tab.element().focus();
    await userEvent.keyboard("{Shift>}{/Shift}");
    expect(document.activeElement).toBe(tab.element());
    await expect.element(page.getByText(TIP)).not.toBeInTheDocument();
    await userEvent.hover(tab);
    await expect.element(page.getByText(TIP)).toBeVisible();
  });
});
