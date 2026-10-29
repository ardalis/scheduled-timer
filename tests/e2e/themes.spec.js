import { readFile } from "node:fs/promises";
import { test, expect, MINUTE } from "./fixtures.js";

/** A theme file as an export would write it. */
function themeFile(name, styles, extra = {}) {
  return {
    name: `${name}.theme.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "scheduled-timer-theme", version: 1, name, styles, ...extra })),
  };
}

const darkActive = [{ id: "active", background: "#000000" }];

test.describe("themes", () => {
  test("starts on the Default theme", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await expect(timer.themeSelect).toHaveValue("default");
    await expect(timer.themeSelect.locator("option:checked")).toHaveText("Default");
    await expect(timer.themeDelete).toBeDisabled();
  });

  test("saves the current styles as a named theme", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.styleToggle("Starting Soon").uncheck();
    await expect(timer.themeSelect.locator("option:checked")).toHaveText("Default (modified)");

    await timer.themeName.fill("Quiet start");
    await timer.themeSave.click();
    await expect(timer.themeStatus).toHaveText("Saved theme “Quiet start”.");
    await expect(timer.themeSelect.locator("option:checked")).toHaveText("Quiet start");
    await timer.saveConfig();

    const stored = await timer.storedConfig();
    expect(stored.themes).toHaveLength(1);
    expect(stored.themes[0].name).toBe("Quiet start");
    expect(stored.themes[0].styles.find((s) => s.id === "starting-soon").enabled).toBe(false);
    expect(stored.themeId).toBe(stored.themes[0].id);
  });

  test("switches between themes", async ({ timer }) => {
    await timer.open();
    await timer.storeConfig({ themes: [{ id: "theme-dark", name: "Dark", styles: darkActive }] });
    await timer.page.reload();
    await timer.click(timer.startPause);
    expect(await timer.background()).toBe("rgb(18, 184, 41)");

    await timer.openConfig();
    await timer.themeSelect.selectOption({ label: "Dark" });
    await expect(timer.themeStatus).toHaveText("Switched to “Dark”.");
    await expect(timer.themeName).toHaveValue("Dark");
    await timer.saveConfig();
    expect(await timer.background()).toBe("rgb(0, 0, 0)");

    await timer.openConfig();
    await timer.themeSelect.selectOption({ label: "Default" });
    await timer.saveConfig();
    expect(await timer.background()).toBe("rgb(18, 184, 41)");
    expect((await timer.storedConfig()).themeId).toBe("default");
  });

  test("cancel discards theme changes", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.themeName.fill("Temp");
    await timer.themeSave.click();
    await timer.configCancel.click();

    await timer.openConfig();
    await expect(timer.themeSelect.locator("option")).toHaveText(["Default"]);
  });

  test("updates a theme saved again under the same name", async ({ timer }) => {
    await timer.open();
    await timer.storeConfig({ themes: [{ id: "theme-dark", name: "Dark", styles: darkActive }], themeId: "theme-dark" });
    await timer.openConfig();
    await timer.styleToggle("Overtime").uncheck();
    await expect(timer.themeSelect.locator("option:checked")).toHaveText("Dark (modified)");
    await timer.themeName.fill("dark");
    await timer.themeName.press("Enter");
    await expect(timer.themeStatus).toHaveText("Updated theme “dark”.");
    await expect(timer.configDialog).toBeVisible();
    await timer.saveConfig();

    const { themes } = await timer.storedConfig();
    expect(themes).toHaveLength(1);
    expect(themes[0].id).toBe("theme-dark");
    expect(themes[0].styles.find((s) => s.id === "overtime").enabled).toBe(false);
  });

  test("won't save a theme without a name or named Default", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.themeSave.click();
    await expect(timer.themeError).toHaveText("Enter a theme name (up to 40 characters).");
    await expect(timer.themeName).toBeFocused();
    await timer.themeName.fill("default");
    await expect(timer.themeError).toBeHidden();
    await timer.themeSave.click();
    await expect(timer.themeError).toHaveText("“Default” is built in; choose another name.");
  });

  test("deletes a saved theme, keeping its styles", async ({ timer }) => {
    await timer.open();
    await timer.storeConfig({ themes: [{ id: "theme-dark", name: "Dark", styles: darkActive }], themeId: "theme-dark", styles: darkActive });
    await timer.openConfig();
    await expect(timer.themeDelete).toBeEnabled();
    await timer.themeDelete.click();
    await expect(timer.themeStatus).toHaveText("Deleted theme “Dark”.");
    await expect(timer.themeSelect.locator("option:checked")).toHaveText("Custom styles");
    await timer.saveConfig();

    const stored = await timer.storedConfig();
    expect(stored.themes).toEqual([]);
    expect(stored.themeId).toBeNull();
    expect(stored.styles.find((s) => s.id === "active").background).toBe("#000000");
  });

  test("exports the current styles as a theme file", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.styleToggle("Starting Soon").uncheck();
    await timer.themeName.fill("Big Room");
    const [download] = await Promise.all([timer.page.waitForEvent("download"), timer.themeExport.click()]);

    expect(download.suggestedFilename()).toBe("big-room.theme.json");
    const json = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(json).toMatchObject({ format: "scheduled-timer-theme", version: 1, name: "Big Room" });
    expect(json.styles.find((s) => s.id === "starting-soon").enabled).toBe(false);
  });

  test("imports a theme file and applies it", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.themeFile.setInputFiles(themeFile("Dark", darkActive));
    await expect(timer.themeStatus).toHaveText("Imported theme “Dark”.");
    await expect(timer.themeSelect.locator("option:checked")).toHaveText("Dark");
    await timer.saveConfig();

    await timer.click(timer.startPause);
    expect(await timer.background()).toBe("rgb(0, 0, 0)");
    expect((await timer.storedConfig()).themes.map((t) => t.name)).toEqual(["Dark"]);
  });

  test("imports a theme named Default under another name", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.themeFile.setInputFiles(themeFile("Default", darkActive));
    await expect(timer.themeStatus).toHaveText("Imported theme “Default (imported)”.");
  });

  test("explains a file that isn't a theme", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.themeFile.setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
    await expect(timer.themeError).toHaveText("That file isn't valid JSON.");
    await timer.themeFile.setInputFiles(themeFile("Later", [], { version: 99 }));
    await expect(timer.themeError).toHaveText("That theme was made by a newer version of Scheduled Timer.");
    await expect(timer.themeSelect.locator("option")).toHaveText(["Default"]);
  });

  test("the import button opens the file picker", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    const [chooser] = await Promise.all([timer.page.waitForEvent("filechooser"), timer.themeImport.click()]);
    await chooser.setFiles(themeFile("Dark", darkActive));
    await expect(timer.themeStatus).toHaveText("Imported theme “Dark”.");
  });
});

test.describe("duration expressions in style starts", () => {
  test("starts a style at a fraction of the duration", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.configDuration.fill("20");
    await timer.addStyle.click();
    await timer.styleName.fill("Wrap up");
    await timer.styleStart.fill("$duration / 10");
    await expect(timer.stylePlusDuration).toBeDisabled();
    await expect(timer.styleDialog.locator("#style-start-hint")).toHaveText(
      "Starts at 2 min ($duration / 10) with the current duration."
    );
    await timer.styleDone.click();
    await expect(timer.styleRow("Wrap up")).toContainText("2 min ($duration / 10)");
    await timer.saveConfig();

    const stored = await timer.storedConfig();
    expect(stored.styles.find((s) => s.name === "Wrap up").start).toEqual({ expression: "$duration / 10" });

    await timer.click(timer.startPause);
    await timer.jump(18 * MINUTE - 1000);
    await timer.expectStyle("active");
    await timer.jump(1000);
    await expect(timer.display).toHaveText("02:00");
    await expect(timer.page.locator("body")).toHaveAttribute("data-style", /^custom-/);
  });

  test("keeps the expression when edited again", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Active");
    await timer.styleStart.fill("$duration - 1");
    await timer.styleDone.click();
    await expect(timer.styleRow("Active")).toContainText("4 min ($duration - 1)");
    await timer.editStyle("Active");
    await expect(timer.styleStart).toHaveValue("$duration - 1");
    await expect(timer.stylePlusDuration).not.toBeChecked();
    await expect(timer.stylePlusDuration).toBeDisabled();
  });

  for (const [value, message] of [
    ["$duration +", "Use numbers, $duration, + - * /, and parentheses, e.g. $duration / 10."],
    ["$duration / ($duration - 5)", "That expression has no value with the current duration (dividing by zero?)."],
    ["$duration * 1000", "That's 5000 minutes with the current duration; keep it between -1440 and 1440."],
  ]) {
    test(`rejects the expression "${value}"`, async ({ timer }) => {
      await timer.open();
      await timer.openConfig();
      await timer.editStyle("Active");
      await timer.styleStart.fill(value);
      await timer.styleDone.click();
      await expect(timer.styleDialog.getByRole("alert")).toHaveText(message);
      await expect(timer.styleStart).toHaveAttribute("aria-invalid", "true");
    });
  }
});
