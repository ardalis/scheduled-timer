import { test, expect, SECOND } from "./fixtures.js";

const blur = (page) => page.evaluate(() => document.activeElement?.blur());

test.describe("keyboard and controls", () => {
  test("Space starts and pauses the timer", async ({ page, timer }) => {
    await timer.open();
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
    await timer.duration.focus();
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
    await blur(page);
    for (const key of ["PageDown", "ArrowRight", "Enter", "b"]) await page.keyboard.press(key);
    await timer.expectState("idle");
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
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
