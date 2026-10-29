import { test, expect, MINUTE, SECOND } from "./fixtures.js";

const BELL = "trolleybus-bell-conductors-5-quicksounds.com.mp3";
const ALERT = "alert-asterisk-5-quicksounds.com.mp3";

/** Records each sound played instead of playing it, or rejects like a browser blocking autoplay. */
async function recordSounds(page, { blocked = false } = {}) {
  await page.addInitScript((blocked) => {
    window.__played = [];
    HTMLMediaElement.prototype.play = function play() {
      window.__played.push(decodeURIComponent(this.src.split("/").pop()));
      return blocked ? Promise.reject(new DOMException("blocked", "NotAllowedError")) : Promise.resolve();
    };
  }, blocked);
}

const played = (page) => page.evaluate(() => window.__played);

test.describe("sounds", () => {
  test("rings the bell when a scheduled presentation starts and the alert when time runs out", async ({ page, timer }) => {
    await recordSounds(page);
    await timer.open();
    await timer.scheduleAt("10:01");
    await timer.jump(MINUTE - SECOND);
    expect(await played(page)).toEqual([]);

    await timer.advance(SECOND);
    await timer.expectState("running");
    expect(await played(page)).toEqual([BELL]);

    await timer.jump(5 * MINUTE - SECOND);
    expect(await played(page)).toEqual([BELL]);
    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("00:00");
    expect(await played(page)).toEqual([BELL, ALERT]);

    // Only once.
    await timer.advance(10 * SECOND);
    expect(await played(page)).toEqual([BELL, ALERT]);
  });

  test("rings when started by hand, but not when resumed", async ({ page, timer }) => {
    await recordSounds(page);
    await timer.open();
    await timer.click(timer.startPause);
    expect(await played(page)).toEqual([BELL]);
    await timer.click(timer.startPause);
    await timer.click(timer.startPause);
    await timer.expectState("running");
    expect(await played(page)).toEqual([BELL]);
  });

  test("doesn't ring for moments long past, like a tab that slept through them", async ({ page, timer }) => {
    await recordSounds(page);
    await timer.open();
    await timer.scheduleAt("10:01");
    // Throttled background tab: one late tick, well after the start.
    await timer.jump(2 * MINUTE);
    await timer.expectState("running");
    await timer.jump(10 * MINUTE);
    await expect(timer.display).toHaveText("-06:00");
    expect(await played(page)).toEqual([]);
  });

  test("doesn't ring again when reloaded mid-presentation", async ({ page, timer }) => {
    await recordSounds(page);
    await timer.open();
    await timer.scheduleAt("10:01");
    await timer.jump(MINUTE);
    expect(await played(page)).toEqual([BELL]);
    await page.reload();
    await timer.expectState("running");
    await timer.advance(SECOND);
    expect(await played(page)).toEqual([]);
  });

  test("can be changed or turned off in configuration", async ({ page, timer }) => {
    await recordSounds(page);
    await timer.open();
    await timer.openConfig();
    await expect(timer.soundStart).toHaveValue("trolleybus-bell");
    await expect(timer.soundEnd).toHaveValue("alert-asterisk");
    await timer.soundStart.selectOption({ label: "None" });
    await timer.soundEnd.selectOption({ label: "Trolleybus bell" });
    await timer.configDuration.fill("0.1");
    await timer.saveConfig();
    expect((await timer.storedConfig()).sounds).toEqual({ start: "none", end: "trolleybus-bell" });

    await timer.click(timer.startPause);
    await timer.advance(7 * SECOND);
    expect(await played(page)).toEqual([BELL]);
  });

  test("previews a sound from configuration", async ({ page, timer }) => {
    await recordSounds(page);
    await timer.open();
    await timer.openConfig();
    await timer.configDialog.getByRole("button", { name: "Play the end sound" }).click();
    expect(await played(page)).toEqual([ALERT]);
    await timer.soundStart.selectOption({ label: "None" });
    await expect(timer.configDialog.getByRole("button", { name: "Play the start sound" })).toBeDisabled();
  });

  test("explains when the browser blocks a sound", async ({ page, timer }) => {
    await recordSounds(page, { blocked: true });
    await timer.open();
    await timer.scheduleAt("10:01");
    await expect(timer.soundBlocked).toBeHidden();
    await timer.jump(MINUTE);
    await timer.expectState("running");
    await expect(timer.soundBlocked).toBeVisible();
    await page.mouse.click(5, 300);
    await expect(timer.soundBlocked).toBeHidden();
  });

  test("serves the sound files", async ({ page, timer }) => {
    await timer.open();
    for (const file of [BELL, ALERT]) {
      const response = await page.request.get(`sounds/${file}`);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toBe("audio/mpeg");
    }
  });
});
