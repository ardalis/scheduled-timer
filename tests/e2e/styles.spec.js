import { test, expect, HOUR, MINUTE, SECOND } from "./fixtures.js";

const GREY = "rgb(43, 47, 54)";
const BLUE = "rgb(58, 123, 213)";
const GREEN = "rgb(18, 184, 41)";
const RED = "rgb(229, 20, 27)";
const WHITE = "rgb(255, 255, 255)";

test.describe("styles on screen", () => {
  test("uses the muted Inactive style while idle", async ({ timer }) => {
    await timer.open();
    await timer.expectStyle("inactive");
    expect(await timer.background()).toBe(GREY);
    await expect(timer.display).toHaveCSS("color", "rgb(154, 163, 173)");
  });

  test("moves through Inactive, Starting Soon, Active, and Overtime", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    // 30 minutes before the start is more than duration + 5 from zero.
    await timer.expectStyle("inactive");

    // Starting Soon begins 5 minutes before the start (duration + 5 from zero).
    await timer.jump(25 * MINUTE - SECOND);
    await timer.expectStyle("inactive");
    await timer.advance(SECOND);
    await timer.expectStyle("starting-soon");
    expect(await timer.background()).toBe(BLUE);
    await expect(timer.display).toHaveCSS("color", WHITE);
    await expect(timer.display).toHaveCSS("font-family", /Caveat/);

    // Active takes over the moment the timer starts.
    await timer.jump(5 * MINUTE - SECOND);
    await timer.expectStyle("starting-soon");
    await timer.advance(SECOND);
    await timer.expectState("running");
    await timer.expectStyle("active");
    expect(await timer.background()).toBe(GREEN);
    await expect(timer.display).toHaveCSS("color", WHITE);
    await expect(timer.display).toHaveCSS("font-weight", "900");

    // Overtime from 00:00.
    await timer.jump(5 * MINUTE - SECOND);
    await timer.expectStyle("active");
    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("00:00");
    await timer.expectStyle("overtime");
    expect(await timer.background()).toBe(RED);
    await expect(timer.display).toHaveCSS("color", WHITE);
    await expect(timer.display).toHaveCSS("font-family", /Bangers/);

    // Still Overtime when the timer stops an hour over.
    await timer.jump(HOUR);
    await timer.expectState("stopped");
    await timer.expectStyle("overtime");
  });

  test("uses Active when starting manually", async ({ timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.expectStyle("active");
    await timer.click(timer.startPause);
    await timer.expectState("paused");
    await timer.expectStyle("active");
    await timer.click(timer.reset);
    await timer.expectStyle("inactive");
  });

  test("loads the self-hosted fonts", async ({ page, timer }) => {
    await timer.open();
    await timer.setMinutes(0.05);
    await timer.click(timer.startPause);
    await timer.advance(4 * SECOND);
    await timer.expectStyle("overtime");
    await expect.poll(() => page.evaluate(() => document.fonts.check('100px "Bangers"'))).toBe(true);
    await page.evaluate(() => document.fonts.load('700 100px "Caveat"'));
    expect(await page.evaluate(() => document.fonts.check('700 100px "Caveat"'))).toBe(true);
  });

  for (const [label, minutes, wait, id] of [
    ["Active (bold)", 5, 0, "active"],
    ["Overtime (Bangers)", 0.05, 4 * SECOND, "overtime"],
  ]) {
    test(`fits the readout in the window with ${label}`, async ({ page, timer }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await timer.open();
      await timer.setMinutes(minutes);
      await timer.click(timer.startPause);
      await timer.advance(wait || SECOND);
      await timer.expectStyle(id);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      const box = await timer.display.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    });
  }

  test("follows the duration: Starting Soon is duration + 5", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(20);
    await timer.scheduleAt("10:06");
    // 6 minutes to the start = 26 from zero: not yet (Starting Soon is at 25).
    await timer.expectStyle("inactive");
    await timer.jump(MINUTE);
    await timer.expectStyle("starting-soon");
  });
});

test.describe("styles in configuration", () => {
  test("lists each style with its name and time, largest to smallest", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();

    expect(await timer.styleNames()).toEqual(["Inactive", "Starting Soon", "Active", "Overtime"]);
    await expect(timer.styleRow("Inactive")).toContainText("Otherwise");
    await expect(timer.styleRow("Starting Soon")).toContainText("10 min (duration + 5)");
    await expect(timer.styleRow("Active")).toContainText("5 min (duration)");
    await expect(timer.styleRow("Overtime")).toContainText("-60 min");
    for (const name of ["Inactive", "Starting Soon", "Active", "Overtime"]) {
      await expect(timer.styleToggle(name)).toBeChecked();
    }
  });

  test("updates relative times as the duration is typed", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.configDuration.fill("20");
    await expect(timer.styleRow("Starting Soon")).toContainText("25 min (duration + 5)");
    await expect(timer.styleRow("Active")).toContainText("20 min (duration)");
    // An invalid duration leaves the last valid one.
    await timer.configDuration.fill("0");
    await expect(timer.styleRow("Active")).toContainText("5 min (duration)");
  });

  test("disables a style", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.styleToggle("Starting Soon").uncheck();
    await expect(timer.styleList.locator(".style-item.is-disabled")).toHaveCount(1);
    await timer.saveConfig();

    const stored = await timer.storedConfig();
    expect(stored.styles.find((s) => s.id === "starting-soon").enabled).toBe(false);

    await timer.scheduleAt("10:03");
    await timer.expectStyle("inactive");
    await timer.jump(3 * MINUTE);
    await timer.expectStyle("active");
  });

  test("disabling Inactive leaves the plain look where no style applies", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.styleToggle("Inactive").uncheck();
    await timer.saveConfig();

    await timer.expectStyle("");
    await expect(timer.page.locator("body")).not.toHaveClass(/styled/);
    expect(await timer.background()).toBe("rgb(11, 13, 16)");
    await timer.click(timer.startPause);
    await timer.expectStyle("active");
  });

  test("opens a style in an editor with a live preview", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Active");

    await expect(timer.styleName).toHaveValue("Active");
    await expect(timer.styleStart).toHaveValue("0");
    await expect(timer.stylePlusDuration).toBeChecked();
    await expect(timer.styleBackground).toHaveValue("#12b829");
    await expect(timer.stylePreview).toHaveCSS("background-color", GREEN);
    await expect(timer.stylePreview).toContainText("05:00");

    await timer.styleBackground.fill("#112233");
    await expect(timer.stylePreview).toHaveCSS("background-color", "rgb(17, 34, 51)");
    await timer.styleColor.fill("#ffee00");
    await expect(timer.stylePreview).toHaveCSS("color", "rgb(255, 238, 0)");
    await timer.styleFont.selectOption("serif");
    await expect(timer.stylePreview).toHaveCSS("font-family", /Georgia/);
    await timer.styleWeight.selectOption("400");
    await expect(timer.stylePreview).toHaveCSS("font-weight", "400");
    await timer.styleShadow.check();
    await expect(timer.stylePreview).not.toHaveCSS("text-shadow", "none");
    await timer.styleSize.fill("50");
    await expect(timer.styleDialog.getByText("50%")).toBeVisible();
  });

  test("applies an edited style after saving", async ({ page, timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Inactive");
    await timer.styleName.fill("Waiting");
    await timer.styleBackground.fill("#334455");
    await timer.styleFont.selectOption("mono");
    await timer.styleDone.click();
    await expect(timer.styleDialog).toBeHidden();
    await expect(timer.styleRow("Waiting")).toBeVisible();

    // Not applied until the configuration is saved.
    expect(await timer.background()).toBe(GREY);
    await timer.saveConfig();
    expect(await timer.background()).toBe("rgb(51, 68, 85)");
    await expect(timer.display).toHaveCSS("font-family", /monospace/);

    await page.reload();
    expect(await timer.background()).toBe("rgb(51, 68, 85)");
    await timer.openConfig();
    await expect(timer.styleRow("Waiting")).toBeVisible();
  });

  test("shrinks the readout with the size option", async ({ timer }) => {
    await timer.open();
    const fullSize = await timer.display.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await timer.openConfig();
    await timer.editStyle("Inactive");
    await timer.styleSize.fill("50");
    await timer.styleDone.click();
    await timer.saveConfig();
    const halfSize = await timer.display.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(halfSize).toBeCloseTo(fullSize / 2, 0);
  });

  test("changes a built-in style's start", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Starting Soon");
    await timer.styleStart.fill("15");
    await expect(timer.styleDialog.getByText("Starts at 20 min (duration + 15)")).toBeVisible();
    await timer.styleDone.click();
    await expect(timer.styleRow("Starting Soon")).toContainText("20 min (duration + 15)");
    await timer.saveConfig();

    await timer.scheduleAt("10:16");
    // 16 minutes to the start = 21 from zero.
    await timer.expectStyle("inactive");
    await timer.jump(MINUTE);
    await timer.expectStyle("starting-soon");
  });

  test("hides the start for Inactive", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Inactive");
    await expect(timer.styleStart).toBeHidden();
    await expect(timer.styleDialog.getByText("Inactive applies whenever no other style does")).toBeVisible();
  });

  test("can't delete built-in styles", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    for (const name of ["Inactive", "Starting Soon", "Active", "Overtime"]) {
      await timer.editStyle(name);
      await expect(timer.styleDelete).toBeDisabled();
      await expect(timer.styleDialog.locator("#style-delete-wrap")).toHaveAttribute(
        "title",
        "Built-in styles cannot be deleted."
      );
      await timer.styleCancel.click();
    }
  });

  test("disables a style from its editor", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Overtime");
    await timer.styleEnabled.uncheck();
    await timer.styleDone.click();
    await expect(timer.styleToggle("Overtime")).not.toBeChecked();
  });

  test("adds a custom style, ordered by its start, and applies it", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.addStyle.click();
    await expect(timer.styleDialog).toBeVisible();
    await expect(timer.styleDialog.getByRole("heading", { level: 2 })).toHaveText("Add style");
    await expect(timer.styleDelete).toBeDisabled();

    await timer.styleName.fill("Wrap it up");
    await timer.styleStart.fill("1");
    await timer.styleBackground.fill("#ff8800");
    await timer.styleDone.click();

    expect(await timer.styleNames()).toEqual(["Inactive", "Starting Soon", "Active", "Wrap it up", "Overtime"]);
    await expect(timer.styleRow("Wrap it up")).toContainText("1 min");
    await timer.saveConfig();

    await timer.click(timer.startPause);
    await timer.jump(4 * MINUTE - SECOND);
    await timer.expectStyle("active");
    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("01:00");
    expect(await timer.currentStyle()).toMatch(/^custom-/);
    expect(await timer.background()).toBe("rgb(255, 136, 0)");
    await timer.jump(MINUTE);
    await timer.expectStyle("overtime");
  });

  test("adds a custom style over time", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.addStyle.click();
    await timer.styleName.fill("Really over");
    await timer.styleStart.fill("-10");
    await timer.styleDone.click();
    expect(await timer.styleNames()).toEqual(["Inactive", "Starting Soon", "Active", "Really over", "Overtime"]);
    await timer.saveConfig();

    await timer.setMinutes(0.05);
    await timer.click(timer.startPause);
    await timer.advance(4 * SECOND);
    // The closest to zero wins: Really over (-10) covers 0 to -10.
    expect(await timer.currentStyle()).toMatch(/^custom-/);
    await timer.jump(10 * MINUTE + SECOND);
    await timer.expectStyle("overtime");
  });

  test("deletes a custom style", async ({ page, timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.addStyle.click();
    await timer.styleName.fill("Temporary");
    await timer.styleDone.click();
    await timer.saveConfig();

    await timer.openConfig();
    await timer.editStyle("Temporary");
    await expect(timer.styleDelete).toBeEnabled();
    await expect(timer.styleDialog.locator("#style-delete-wrap")).not.toHaveAttribute("title", /cannot/);
    await timer.styleDelete.click();
    await expect(timer.styleDialog).toBeHidden();
    expect(await timer.styleNames()).toEqual(["Inactive", "Starting Soon", "Active", "Overtime"]);
    await timer.saveConfig();

    await page.reload();
    await timer.openConfig();
    expect(await timer.styleNames()).toEqual(["Inactive", "Starting Soon", "Active", "Overtime"]);
  });

  test("validates the name and start", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.addStyle.click();

    await timer.styleName.fill("  ");
    await timer.styleDone.click();
    await expect(timer.styleDialog.getByText("Enter a name")).toBeVisible();
    await expect(timer.styleName).toBeFocused();

    await timer.styleName.fill("Zero");
    await timer.styleStart.fill("0");
    await timer.styleDone.click();
    await expect(timer.styleDialog.getByText("not at 0")).toBeVisible();

    await timer.styleStart.fill("2000");
    await timer.styleDone.click();
    await expect(timer.styleDialog.getByText("between -1440 and 1440")).toBeVisible();

    // 0 plus the duration is fine: it starts at the duration.
    await timer.styleStart.fill("0");
    await timer.stylePlusDuration.check();
    await expect(timer.styleDialog.getByRole("alert")).toHaveCount(0);
    await timer.styleDone.click();
    await expect(timer.styleDialog).toBeHidden();
  });

  test("cancelling the editor discards changes", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Active");
    await timer.styleName.fill("Changed");
    await timer.styleCancel.click();
    await expect(timer.styleRow("Active")).toBeVisible();

    await timer.addStyle.click();
    await timer.styleName.fill("Never added");
    await timer.page.keyboard.press("Escape");
    await expect(timer.styleDialog).toBeHidden();
    await expect(timer.configDialog).toBeVisible();
    expect(await timer.styleNames()).toEqual(["Inactive", "Starting Soon", "Active", "Overtime"]);
  });

  test("cancelling the configuration discards style changes", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.styleToggle("Active").uncheck();
    await timer.editStyle("Inactive");
    await timer.styleBackground.fill("#000000");
    await timer.styleDone.click();
    await timer.configCancel.click();

    await timer.openConfig();
    await expect(timer.styleToggle("Active")).toBeChecked();
    expect(await timer.background()).toBe(GREY);
  });

  test("restores built-in styles missing from storage", async ({ page, timer }) => {
    await timer.open();
    await timer.storeConfig({ durationMinutes: 5, styles: [{ id: "active", name: "Go" }] });
    await page.reload();
    await timer.openConfig();
    expect(await timer.styleNames()).toEqual(["Inactive", "Starting Soon", "Go", "Overtime"]);
  });
});
