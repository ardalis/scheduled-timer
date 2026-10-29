import { test, expect, MINUTE, SECOND } from "./fixtures.js";

const strobing = (timer) => expect(timer.page.locator("body")).toHaveClass(/effect-strobe/);
const notStrobing = (timer) => expect(timer.page.locator("body")).not.toHaveClass(/effect-strobe/);

test.describe("effects", () => {
  test("strobes for 5 seconds when time runs out", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(1);
    await timer.click(timer.startPause);
    await timer.jump(MINUTE - SECOND);
    await notStrobing(timer);

    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("00:00");
    await strobing(timer);
    // The overlay inverts the colors beneath it.
    const overlay = await timer.page.evaluate(() => getComputedStyle(document.body, "::after").mixBlendMode);
    expect(overlay).toBe("difference");

    await timer.advance(4 * SECOND);
    await strobing(timer);
    await timer.advance(SECOND);
    await expect(timer.display).toHaveText("-00:05");
    await notStrobing(timer);
  });

  test("stops strobing while paused", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(0.1);
    await timer.click(timer.startPause);
    await timer.advance(7 * SECOND);
    await strobing(timer);
    await timer.click(timer.startPause);
    await timer.expectState("paused");
    await notStrobing(timer);
  });

  test("can be disabled", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Overtime");
    await expect(timer.effectList.locator(".effect-name")).toHaveText(["Strobe for 5 s"]);
    await timer.styleDialog.getByLabel("Enable Strobe").uncheck();
    await timer.styleDone.click();
    await timer.configDuration.fill("0.1");
    await timer.saveConfig();
    expect((await timer.storedConfig()).styles.find((s) => s.id === "overtime").effects[0].enabled).toBe(false);

    await timer.click(timer.startPause);
    await timer.advance(7 * SECOND);
    await expect(timer.display).toHaveText("-00:01");
    await notStrobing(timer);
  });

  test("can be removed, and changed timing is saved", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Overtime");
    await timer.styleDialog.getByLabel("Strobe lasts (seconds, 0 until the style ends)").fill("10");
    await timer.styleDialog.getByLabel("Strobe starts after (seconds)").fill("2");
    await expect(timer.effectList.locator(".effect-name")).toHaveText(["Strobe for 10 s after 2 s"]);
    await timer.styleDone.click();
    await timer.saveConfig();
    expect((await timer.storedConfig()).styles.find((s) => s.id === "overtime").effects).toEqual([
      { id: "strobe", type: "strobe", enabled: true, startSeconds: 2, durationSeconds: 10 },
    ]);

    await timer.openConfig();
    await timer.editStyle("Overtime");
    await timer.styleDialog.getByRole("button", { name: "Remove Strobe" }).click();
    await expect(timer.effectList.locator(".effect-item")).toHaveCount(0);
    await timer.styleDone.click();
    await timer.saveConfig();
    expect((await timer.storedConfig()).styles.find((s) => s.id === "overtime").effects).toEqual([]);
  });

  test("rejects invalid timing", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Overtime");
    const lasts = timer.styleDialog.getByLabel("Strobe lasts (seconds, 0 until the style ends)");
    await lasts.fill("-4");
    await timer.styleDone.click();
    await expect(timer.styleDialog).toBeVisible();
    await expect(timer.styleDialog.locator("#effect-error")).toHaveText("Enter whole seconds from 0 to 86400.");
    await expect(lasts).toHaveAttribute("aria-invalid", "true");
    await expect(lasts).toBeFocused();

    await lasts.fill("3");
    await expect(timer.styleDialog.locator("#effect-error")).toBeHidden();
  });

  test("adds a strobe to another style", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Starting Soon");
    await timer.styleDialog.getByLabel("Effect type").selectOption("strobe");
    await timer.styleDialog.getByRole("button", { name: "Add effect" }).click();
    await expect(timer.styleDialog.getByLabel("Strobe starts after (seconds)")).toBeFocused();
    await timer.styleDone.click();
    await timer.saveConfig();

    // Starting Soon begins 5 minutes before the start.
    await timer.scheduleAt("10:06");
    await notStrobing(timer);
    await timer.jump(MINUTE);
    await strobing(timer);
    await timer.jump(5 * SECOND);
    await notStrobing(timer);
  });

  test("Inactive has no effects", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Inactive");
    await expect(timer.styleDialog.locator("#style-effects-field")).toBeHidden();
  });

  test("fades into the next style", async ({ timer }) => {
    await timer.open();
    await timer.storeConfig({
      durationMinutes: 1,
      styles: [{ id: "active", effects: [{ id: "f", type: "fade", startSeconds: 20 }] }],
    });
    await timer.page.reload();
    await timer.click(timer.startPause);

    // Active is #12b829; Overtime is #e5141b.
    await timer.jump(19 * SECOND);
    expect(await timer.background()).toBe("rgb(18, 184, 41)");
    await timer.jump(21 * SECOND);
    // Halfway through the 40 second fade.
    expect(await timer.background()).toBe("rgb(124, 102, 34)");
    await timer.jump(20 * SECOND);
    await timer.expectStyle("overtime");
    expect(await timer.background()).toBe("rgb(229, 20, 27)");
  });

  test("adds a fade in the editor", async ({ timer }) => {
    await timer.open();
    await timer.openConfig();
    await timer.editStyle("Active");
    await timer.styleDialog.getByLabel("Effect type").selectOption("fade");
    await timer.styleDialog.getByRole("button", { name: "Add effect" }).click();
    await expect(timer.effectList.locator(".effect-name")).toHaveText(["Fade to next style"]);
    // A fade always runs to the end of the style.
    await expect(timer.styleDialog.getByLabel(/Fade to next style lasts/)).toHaveCount(0);
    await timer.styleDone.click();
    await timer.saveConfig();
    const active = (await timer.storedConfig()).styles.find((s) => s.id === "active");
    expect(active.effects).toEqual([expect.objectContaining({ type: "fade", startSeconds: 0, enabled: true })]);
  });
});
