import { test, expect, MINUTE, SECOND } from "./fixtures.js";

test.describe("configuration", () => {
  test("shows a configuration icon in the top right corner", async ({ page, timer }) => {
    await timer.open();
    await expect(timer.configButton).toBeVisible();
    const box = await timer.configButton.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x + box.width).toBeGreaterThan(viewport.width - 40);
    expect(box.y).toBeLessThan(40);
  });

  test("opens with the default 5 minute duration", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await expect(timer.configDuration).toHaveValue("5");
    await expect(timer.configDuration).toBeFocused();
  });

  test("saves a new duration to browser storage and applies it", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(20);

    await expect(timer.display).toHaveText("20:00");
    expect(await timer.storedConfig()).toEqual({ durationMinutes: 20 });
  });

  test("keeps the saved duration after a reload", async ({ page, timer }) => {
    await timer.open();
    await timer.setMinutes(20);
    await page.reload();

    await expect(timer.display).toHaveText("20:00");
    await timer.openConfig();
    await expect(timer.configDuration).toHaveValue("20");
  });

  test("reloads the configuration from storage every time it is opened", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(20);
    // Simulate another tab changing the settings.
    await timer.storeConfig({ durationMinutes: 45 });

    await timer.openConfig();
    await expect(timer.configDuration).toHaveValue("45");
  });

  test("accepts any number of minutes, including fractions", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(7.5);
    await expect(timer.display).toHaveText("07:30");

    await timer.setMinutes(0.25);
    await expect(timer.display).toHaveText("00:15");

    await timer.setMinutes(1440);
    await expect(timer.display).toHaveText("24:00:00");
  });

  test("counts down from a fractional duration", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(0.5);
    await timer.click(timer.startPause);
    await timer.advance(10 * SECOND);
    await expect(timer.display).toHaveText("00:20");
  });

  for (const value of ["0", "-3", "", "1441", "0.001"]) {
    test(`rejects a duration of "${value}"`, async ({ timer }) => {
      await timer.open();
      await timer.openConfig();
      await timer.configDuration.fill(value);
      await timer.configSave.click();

      await expect(timer.configDialog).toBeVisible();
      await expect(timer.configDialog.getByRole("alert")).toHaveText(
        "Enter a number of minutes greater than 0 and at most 1440."
      );
      await expect(timer.configDuration).toHaveAttribute("aria-invalid", "true");
      expect(await timer.storedConfig()).toBeNull();
      await expect(timer.display).toHaveText("05:00");
    });
  }

  test("clears the error once the duration is edited", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.configDuration.fill("0");
    await timer.configSave.click();
    await expect(timer.configDialog.getByRole("alert")).toBeVisible();

    await timer.configDuration.fill("8");
    await expect(timer.configDialog.getByRole("alert")).toBeHidden();
    await timer.configSave.click();
    await expect(timer.configDialog).toBeHidden();
    await expect(timer.display).toHaveText("08:00");
  });

  test("saves with Enter", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.configDuration.fill("12");
    await timer.configDuration.press("Enter");
    await expect(timer.configDialog).toBeHidden();
    await expect(timer.display).toHaveText("12:00");
  });

  test("cancel and Escape discard changes", async ({ page, timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.configDuration.fill("30");
    await timer.configCancel.click();
    await expect(timer.configDialog).toBeHidden();

    await timer.openConfig();
    await expect(timer.configDuration).toHaveValue("5");
    await timer.configDuration.fill("30");
    await page.keyboard.press("Escape");
    await expect(timer.configDialog).toBeHidden();

    await expect(timer.display).toHaveText("05:00");
    expect(await timer.storedConfig()).toBeNull();
  });

  test("a new duration while running applies after reset", async ({ timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.advance(10 * SECOND);

    await timer.openConfig();
    await expect(timer.configDialog.getByText("applies when the current timer is reset")).toBeVisible();
    await timer.configDuration.fill("10");
    await timer.configSave.click();

    await expect(timer.display).toHaveText("04:50");
    await timer.click(timer.reset);
    await expect(timer.display).toHaveText("10:00");
  });

  test("does not mention reset when the timer is idle", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await expect(timer.configDialog.getByText("applies when the current timer is reset")).toBeHidden();
  });

  test("a new duration while waiting applies to the scheduled timer", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    await timer.setMinutes(15);

    await timer.expectState("waiting");
    await expect(timer.display).toHaveText("15:00");
    // The schedule cookie now lasts for the longer timer.
    const cookie = await timer.cookie("scheduledStart");
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + (45 + 60) * 60);

    await timer.jump(30 * MINUTE);
    await timer.expectState("running");
    await expect(timer.display).toHaveText("15:00");
  });

  test("ignores keyboard shortcuts while open", async ({ page, timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.configCancel.focus();
    await page.keyboard.press("f");
    await timer.configDuration.focus();
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.keyboard.press("Escape");
    await timer.expectState("idle");
  });

  test("keeps controls visible while open during a running timer", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.openConfig();
    await timer.configCancel.focus();
    await timer.advance(5 * SECOND);
    await expect(page.locator("body")).not.toHaveClass(/controls-hidden/);
  });

  test("hides the icon with the controls while the timer runs", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.advance(4 * SECOND);
    await expect(page.locator("body")).toHaveClass(/controls-hidden/);
    await expect(timer.configButton).toHaveCSS("opacity", "0");
  });

  test("falls back to defaults when stored settings are corrupt", async ({ page, timer }) => {
    await timer.open();
    await page.evaluate(() => localStorage.setItem("scheduled-timer:config", "{oops"));
    await page.reload();
    await expect(timer.display).toHaveText("05:00");
  });

  test.describe("migrating the old duration cookie", () => {
    test("moves it into browser storage", async ({ page, timer }) => {
      await timer.open();
      await page.context().addCookies([{ name: "timerMinutes", value: "12", url: page.url() }]);
      await page.reload();

      await expect(timer.display).toHaveText("12:00");
      expect(await timer.storedConfig()).toEqual({ durationMinutes: 12 });
      expect(await timer.cookie("timerMinutes")).toBeNull();
    });

    test("prefers settings already in storage", async ({ page, timer }) => {
      await timer.open();
      await timer.storeConfig({ durationMinutes: 9 });
      await page.context().addCookies([{ name: "timerMinutes", value: "12", url: page.url() }]);
      await page.reload();

      await expect(timer.display).toHaveText("09:00");
      expect(await timer.cookie("timerMinutes")).toBeNull();
    });

    test("discards an invalid cookie", async ({ page, timer }) => {
      await timer.open();
      await page.context().addCookies([{ name: "timerMinutes", value: "nope", url: page.url() }]);
      await page.reload();

      await expect(timer.display).toHaveText("05:00");
      expect(await timer.storedConfig()).toBeNull();
      expect(await timer.cookie("timerMinutes")).toBeNull();
    });
  });

  test("warns when settings can't be saved, but still applies them", async ({ page, timer }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      };
    });
    await timer.open();
    await timer.openConfig();
    await timer.configDuration.fill("3");
    await timer.configSave.click();

    await expect(timer.configDialog).toBeVisible();
    await expect(timer.configDialog.getByText("Settings couldn't be saved")).toBeVisible();
    await expect(timer.display).toHaveText("03:00");
  });

  test("works when browser storage is blocked entirely", async ({ page, timer }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access denied", "SecurityError");
        },
      });
    });
    await timer.open();
    await expect(timer.display).toHaveText("05:00");
    await timer.openConfig();
    await timer.configDuration.fill("4");
    await timer.configSave.click();
    await expect(timer.configDialog.getByText("Settings couldn't be saved")).toBeVisible();
    await expect(timer.display).toHaveText("04:00");
  });
});
