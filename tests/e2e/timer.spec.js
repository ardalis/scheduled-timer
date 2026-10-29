import { test, expect, MINUTE, SECOND } from "./fixtures.js";

test.describe("timer", () => {
  test("shows a 5 minute timer in a large, full-screen display by default", async ({ page, timer }) => {
    await timer.open();

    await timer.expectState("idle");
    await expect(timer.display).toHaveText("05:00");
    await expect(timer.status).toHaveText("");
    await expect(page).toHaveTitle("Scheduled Timer");

    const viewport = page.viewportSize();
    const box = await timer.display.boundingBox();
    expect(box.width).toBeGreaterThan(viewport.width * 0.6);
    expect(box.height).toBeGreaterThan(viewport.height * 0.4);
    const fontSize = await timer.display.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThan(200);
  });

  for (const [minutes, text] of [[5, "05:00"], [90, "01:30:00"], [1440, "24:00:00"]]) {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 1920, height: 600 }]) {
      test(`fits ${text} inside a ${viewport.width}x${viewport.height} window`, async ({ page, timer }) => {
        await page.setViewportSize(viewport);
        await timer.open();
        await timer.setMinutes(minutes);
        await expect(timer.display).toHaveText(text);

        const box = await timer.display.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        const overflow = await timer.display.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        // Still large: at least half the window wide or most of its height.
        expect(box.width > viewport.width * 0.5 || box.height > viewport.height * 0.5).toBe(true);
      });
    }
  }

  test("counts down once started", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.startPause);

    await timer.expectState("running");
    await expect(timer.startPause).toHaveText("Pause");
    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("04:59");
    await timer.jump(2 * MINUTE);
    await expect(timer.display).toHaveText("02:59");
    await expect(page).toHaveTitle("02:59 · Scheduled Timer");
  });

  test("highlights the final minute, then counts into negative time", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.startPause);

    await timer.jump(4 * MINUTE - SECOND);
    await expect(timer.display).toHaveText("01:01");
    await expect(page.locator("body")).not.toHaveClass(/final-minute/);

    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("01:00");
    await expect(page.locator("body")).toHaveClass(/final-minute/);

    await timer.jump(MINUTE - SECOND);
    await expect(timer.display).toHaveText("00:01");
    await expect(page.locator("body")).not.toHaveClass(/overtime/);

    await timer.advance(SECOND);
    await timer.expectState("running");
    await expect(timer.display).toHaveText("00:00");
    await expect(page.locator("body")).toHaveClass(/overtime/);
    await expect(page.locator("body")).not.toHaveClass(/final-minute/);

    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("-00:01");
    await expect(page).toHaveTitle("-00:01 · Scheduled Timer");
  });

  test("keeps counting over time", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(1);
    await timer.click(timer.startPause);
    await timer.jump(MINUTE + 5 * MINUTE + 30 * SECOND);
    await timer.expectState("running");
    await expect(timer.display).toHaveText("-05:30");
    await expect(timer.status).toHaveText("");
  });

  test("shows over time in red", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(0.1);
    await timer.click(timer.startPause);
    await timer.advance(7 * SECOND);
    await expect(timer.display).toHaveText("-00:01");
    // The Overtime style: bright red background.
    expect(await timer.background()).toBe("rgb(229, 20, 27)");
  });

  test("shows over time in red text when no style applies", async ({ timer }) => {
    await timer.open();
    await timer.storeConfig({
      durationMinutes: 0.1,
      styles: ["inactive", "starting-soon", "active", "overtime"].map((id) => ({ id, enabled: false })),
    });
    await timer.page.reload();
    const before = await timer.display.evaluate((el) => getComputedStyle(el).color);
    await timer.click(timer.startPause);
    await timer.advance(7 * SECOND);
    await expect(timer.display).toHaveText("-00:01");
    await expect(timer.display).not.toHaveCSS("color", before);
    await expect(timer.display).toHaveCSS("color", "rgb(255, 77, 79)");
  });

  test("stops an hour over time", async ({ page, timer }) => {
    await timer.open();
    await timer.setMinutes(1);
    await timer.click(timer.startPause);

    await timer.jump(MINUTE + 59 * MINUTE + 58 * SECOND);
    await expect(timer.display).toHaveText("-59:58");
    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("-59:59");
    await timer.expectState("running");

    await timer.advance(SECOND);
    await timer.expectState("stopped");
    await expect(timer.display).toHaveText("-01:00:00");
    await expect(timer.status).toHaveText("Stopped after an hour over time.");
    await expect(page).toHaveTitle("Scheduled Timer");

    // It no longer counts.
    await timer.jump(10 * MINUTE);
    await timer.expectState("stopped");
    await expect(timer.display).toHaveText("-01:00:00");
  });

  test("stops an hour over time even when the tab was asleep", async ({ timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.jump(3 * 60 * MINUTE);
    await timer.expectState("stopped");
    await expect(timer.display).toHaveText("-01:00:00");
  });

  test("can pause and resume over time", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(1);
    await timer.click(timer.startPause);
    await timer.jump(MINUTE + 10 * SECOND);
    await timer.click(timer.startPause);
    await timer.expectState("paused");
    await expect(timer.display).toHaveText("-00:10");
    await expect(timer.page.locator("body")).toHaveClass(/overtime/);

    await timer.jump(5 * MINUTE);
    await expect(timer.display).toHaveText("-00:10");

    await timer.click(timer.startPause);
    await timer.advance(5 * SECOND);
    await expect(timer.display).toHaveText("-00:15");
  });

  test("reset clears over time", async ({ page, timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.jump(7 * MINUTE);
    await timer.click(timer.reset);
    await timer.expectState("idle");
    await expect(timer.display).toHaveText("05:00");
    await expect(page.locator("body")).not.toHaveClass(/overtime/);
  });

  test("can restart after stopping", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(1);
    await timer.click(timer.startPause);
    await timer.jump(61 * MINUTE);
    await timer.expectState("stopped");

    await timer.click(timer.startPause);
    await timer.expectState("running");
    await timer.advance(10 * SECOND);
    await expect(timer.display).toHaveText("00:50");
  });

  test("pauses and resumes without losing time", async ({ timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.advance(10 * SECOND);

    await timer.click(timer.startPause);
    await timer.expectState("paused");
    await expect(timer.startPause).toHaveText("Resume");
    await expect(timer.status).toHaveText("Paused");
    await expect(timer.display).toHaveText("04:50");

    await timer.jump(MINUTE);
    await expect(timer.display).toHaveText("04:50");

    await timer.click(timer.startPause);
    await timer.expectState("running");
    await timer.advance(10 * SECOND);
    await expect(timer.display).toHaveText("04:40");
  });

  test("resets to the full duration", async ({ timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    await timer.advance(90 * SECOND);
    await timer.click(timer.reset);

    await timer.expectState("idle");
    await expect(timer.display).toHaveText("05:00");
    await expect(timer.startPause).toHaveText("Start now");
  });

  test("shows timers of an hour or more as hh:mm:ss", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(60);
    await expect(timer.display).toHaveText("01:00:00");

    await timer.setMinutes(90);
    await expect(timer.display).toHaveText("01:30:00");
    await timer.click(timer.startPause);
    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("01:29:59");
  });

  test("switches from hh:mm:ss to mm:ss below an hour", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(61);
    await timer.click(timer.startPause);
    await timer.jump(MINUTE);
    await expect(timer.display).toHaveText("01:00:00");
    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("59:59");
  });

  test("changing the duration after stopping goes back to idle", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(1);
    await timer.click(timer.startPause);
    await timer.jump(61 * MINUTE);
    await timer.expectState("stopped");

    await timer.setMinutes(3);
    await timer.expectState("idle");
    await expect(timer.display).toHaveText("03:00");
  });

  test("keeps accurate time when timers are throttled in a background tab", async ({ timer }) => {
    await timer.open();
    await timer.click(timer.startPause);
    // fastForward jumps the clock and fires due timers only once, like a throttled tab.
    await timer.jump(3 * MINUTE + 20 * SECOND);
    await expect(timer.display).toHaveText("01:40");
  });
});
