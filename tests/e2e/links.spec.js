import { test, expect, SECOND } from "./fixtures.js";

const REPO = "https://github.com/ardalis/scheduled-timer";

test.describe("links to the project", () => {
  test("shows a GitHub icon in the top left corner that opens the repo in a new tab", async ({ page, timer }) => {
    await timer.open();
    const link = page.getByRole("link", { name: "Scheduled Timer on GitHub" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", REPO);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    const box = await link.boundingBox();
    expect(box.x).toBeLessThan(40);
    expect(box.y).toBeLessThan(40);
  });

  test("hides the icon with the other controls while running", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.advance(4 * SECOND);
    await expect(page.locator("#github-link")).toHaveCSS("opacity", "0");
  });

  test("asks for bugs and suggestions at the bottom of configuration", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    const note = timer.configDialog.locator(".feedback");
    await expect(note).toContainText("Find a bug? Have a suggestion?");
    const link = note.getByRole("link", { name: `${REPO}/issues` });
    await expect(link).toHaveAttribute("href", `${REPO}/issues`);
    await expect(link).toHaveAttribute("target", "_blank");
  });
});
