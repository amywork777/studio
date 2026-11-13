import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { ImportMenu } from "./ImportMenu";
import { StartChoices } from "./StartChoices";

const menuItems = () =>
  Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent);

describe("Studio's one Import menu", () => {
  it("offers Files or a folder and Scan this computer, and each runs its own action", async () => {
    const actions = { scan: vi.fn(), pick: vi.fn(async () => undefined) };
    await using screen = await render(<ImportMenu actions={actions} />);
    await screen.getByRole("button").click();
    await expect.element(page.getByRole("menuitem").first()).toBeVisible();
    expect(menuItems()).toEqual(["Files or a folder", "Scan this computer"]);
    await page.getByRole("menuitem", { name: "Scan this computer" }).click();
    expect(actions.scan).toHaveBeenCalledOnce();
    expect(actions.pick).not.toHaveBeenCalled();
  });

  it("offers Restore a backup where it makes a project, not where it imports into one", async () => {
    const actions = { scan: vi.fn(), pick: vi.fn(async () => undefined), restore: vi.fn() };
    await using screen = await render(<ImportMenu actions={actions} />);
    await screen.getByRole("button").click();
    await expect.element(page.getByRole("menuitem", { name: "Restore a backup" })).toBeVisible();
    expect(menuItems()).toEqual(["Files or a folder", "Scan this computer", "Restore a backup"]);
    await page.getByRole("menuitem", { name: "Restore a backup" }).click();
    expect(actions.restore).toHaveBeenCalledOnce();
    await expect.element(page.getByRole("menuitem").first()).not.toBeInTheDocument();
    await screen.rerender(
      <ImportMenu actions={actions} hints={{ pick: "Copied", scan: "Scans" }} />,
    );
    await screen.getByRole("button").click();
    await expect.element(page.getByRole("menuitem").first()).toBeVisible();
    expect(menuItems()).toHaveLength(2);
  });

  it("is what the start page's Import a STEP opens, with the same items, beside New part only", async () => {
    const actions = { scan: vi.fn(), pick: vi.fn(async () => undefined) };
    await using screen = await render(
      <StartChoices onNewPart={vi.fn()} newPartBusy={false} importActions={actions} />,
    );
    expect(screen.container.textContent).not.toContain("Describe it to the AI");
    await screen.getByRole("button", { name: /^Import a STEP/ }).click();
    await expect.element(page.getByRole("menuitem").first()).toBeVisible();
    expect(menuItems()).toEqual(["Files or a folder", "Scan this computer"]);
  });

  it("says where each item lands when given hints, and the trigger says into this project", async () => {
    const actions = { scan: vi.fn(), pick: vi.fn(async () => undefined) };
    await using screen = await render(
      <ImportMenu
        actions={actions}
        hints={{ pick: "Copied into Phone stand", scan: "Makes new projects" }}
      />,
    );
    const trigger = screen.getByRole("button");
    await expect.element(trigger).toHaveAttribute("aria-label", "Import into this project");
    await trigger.click();
    await expect.element(page.getByRole("menuitem").first()).toBeVisible();
    expect(menuItems()).toEqual([
      "Files or a folderCopied into Phone stand",
      "Scan this computerMakes new projects",
    ]);
  });

  it("leaves Import a STEP disabled where there is no desktop app", async () => {
    await using screen = await render(
      <StartChoices onNewPart={vi.fn()} newPartBusy={false} importActions={null} />,
    );
    await expect.element(screen.getByRole("button", { name: /^Import a STEP/ })).toBeDisabled();
  });
});
