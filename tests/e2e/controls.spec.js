import { test, expect, SECOND } from "./fixtures.js";

const blur = (page) => page.evaluate(() => document.activeElement?.blur());

test.describe("keyboard and controls", () => {
  test("Space does nothing by default", async ({ page, timer }) => {
    await timer.open();
    await blur(page);
    await page.keyboard.press("Space");
    await timer.expectState("idle");
    expect((await timer.storedConfig())?.keyboardControl ?? false).toBe(false);
  });

  test("Space starts and pauses the timer once enabled", async ({ page, timer }) => {
    await timer.open();
    await timer.enableKeyboardControl();
    expect((await timer.storedConfig()).keyboardControl).toBe(true);
    await page.reload();
    await blur(page);

    await page.keyboard.press("Space");
    await timer.expectState("running");
    await page.keyboard.press("Space");
    await timer.expectState("paused");
    await page.keyboard.press("Space");
    await timer.expectState("running");
  });

  test("Space on a focused button only activates that button once", async ({ timer }) => {
    await timer.open();
    await timer.startPause.focus();
    await timer.page.keyboard.press("Space");
    await timer.expectState("running");
  });

  test("Space while typing in an input does not toggle the timer", async ({ timer }) => {
    await timer.open();
    await timer.enableKeyboardControl();
    await timer.startTime.focus();
    await timer.page.keyboard.press("Space");
    await timer.expectState("idle");
  });

  test("F toggles full screen", async ({ page, timer }) => {
    await timer.open();
    await blur(page);

    await page.keyboard.press("f");
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(timer.fullscreen).toHaveText("Exit full screen");

    await page.keyboard.press("F");
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(timer.fullscreen).toHaveText("Full screen");
  });

  test("the full screen button toggles full screen", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.fullscreen);
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await timer.click(timer.fullscreen);
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  });

  test("other keys do nothing", async ({ page, timer }) => {
    await timer.open();
    await timer.enableKeyboardControl();
    await blur(page);
    for (const key of ["PageDown", "ArrowRight", "Enter", "b"]) await page.keyboard.press(key);
    await timer.expectState("idle");
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  });

  // A speaker clicks a control, then uses a presentation remote, which sends
  // keys to the last focused window.
  const REMOTE_KEYS = ["PageDown", "PageUp", "ArrowRight", "ArrowLeft", "ArrowDown", "Enter", " ", "b", "."];

  test("a remote can't change a running timer after Start now is clicked", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await expect(timer.startPause).not.toBeFocused();
    for (const key of REMOTE_KEYS) await page.keyboard.press(key);
    await timer.expectState("running");
  });

  test("a remote can't change the schedule after Schedule is clicked", async ({ page, timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    await expect(timer.startTime).not.toBeFocused();
    for (const key of REMOTE_KEYS) await page.keyboard.press(key);
    await timer.expectState("waiting");
    await expect(timer.startTime).toHaveValue("10:30");
    await expect(timer.status).toHaveText("Timer will begin in 30 minutes.");
  });

  test("a remote can't change the schedule after pressing Enter in the time field", async ({ page, timer }) => {
    await timer.open();
    await timer.startTime.fill("10:30");
    await timer.startTime.press("Enter");
    await timer.expectState("waiting");
    await expect(timer.startTime).not.toBeFocused();
    for (const key of REMOTE_KEYS) await page.keyboard.press(key);
    await expect(timer.startTime).toHaveValue("10:30");
  });

  test("a remote can't reset the timer after Reset is clicked", async ({ page, timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    await timer.click(timer.reset);
    await expect(timer.reset).not.toBeFocused();
    for (const key of REMOTE_KEYS) await page.keyboard.press(key);
    await timer.expectState("waiting");
  });

  test("keyboard users can still activate the focused button", async ({ page, timer }) => {
    await timer.open();
    await timer.startPause.focus();
    await page.keyboard.press("Enter");
    await timer.expectState("running");
    await expect(timer.startPause).toBeFocused();
  });

  test("Reset takes a second click within 4 seconds", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");

    await timer.click(timer.reset);
    await timer.expectState("waiting");
    await expect(timer.reset).toHaveText("Confirm reset");
    await expect(timer.reset).toHaveClass(/armed/);
    await timer.advance(4 * SECOND);
    await expect(timer.reset).toHaveText("Reset");
    await timer.click(timer.reset);
    await timer.expectState("waiting");

    await timer.click(timer.reset);
    await timer.expectState("idle");
    await expect(timer.reset).toHaveText("Reset");
  });

  test("hides controls and cursor while running and idle, and shows them on mouse move", async ({ page, timer }) => {
    await timer.open();
    const body = page.locator("body");

    // Never hidden while not running.
    await timer.advance(5 * SECOND);
    await expect(body).not.toHaveClass(/controls-hidden/);

    await timer.click(timer.startPause);
    await timer.advance(2 * SECOND);
    await expect(body).not.toHaveClass(/controls-hidden/);
    await timer.advance(1500);
    await expect(body).toHaveClass(/controls-hidden/);
    await expect(timer.controls).toHaveCSS("opacity", "0");

    await page.mouse.move(100, 100);
    await page.mouse.move(200, 200);
    await expect(body).not.toHaveClass(/controls-hidden/);
  });

  test("keeps controls visible while an input in them is focused", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.startTime.focus();
    await timer.advance(5 * SECOND);
    await expect(page.locator("body")).not.toHaveClass(/controls-hidden/);
  });
});
