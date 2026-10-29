import { test, expect, MINUTE, SECOND } from "./fixtures.js";

test.describe("schedule summary on the Inactive screen", () => {
  test("summarizes a scheduled presentation", async ({ timer }) => {
    await timer.open();
    await timer.setMinutes(20);
    await timer.scheduleAt("10:30");

    await expect(timer.summary).toBeVisible();
    await expect(timer.summary.locator("p")).toHaveText([
      "Your 20 minute presentation",
      "is scheduled for",
      "10:30 AM TODAY",
      "30:00 minutes to go!",
    ]);
    // The card replaces the status line.
    await expect(timer.status).toBeHidden();

    await timer.advance(SECOND);
    await expect(timer.summary.locator(".summary-countdown")).toHaveText("29:59 minutes to go!");
  });

  test("says tomorrow, and hours to go, for a start after midnight", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("09:00");
    await expect(timer.summary.locator(".summary-when")).toHaveText("9:00 AM TOMORROW");
    await expect(timer.summary.locator(".summary-countdown")).toHaveText("23:00:00 hours to go!");
  });

  test("shows only while the Inactive style applies", async ({ timer }) => {
    await timer.open();
    await expect(timer.summary).toBeHidden();

    await timer.scheduleAt("10:30");
    await expect(timer.summary).toBeVisible();

    // Starting Soon begins 5 minutes before the start (duration + 5), at 10:25.
    await timer.jump(25 * MINUTE - SECOND);
    await expect(timer.summary).toBeVisible();
    await timer.jump(SECOND);
    await timer.expectStyle("starting-soon");
    await expect(timer.summary).toBeHidden();
    await expect(timer.status).toBeVisible();

    await timer.jump(10 * MINUTE);
    await timer.expectState("running");
    await expect(timer.summary).toBeHidden();
  });

  test("shows while waiting even if Inactive is disabled", async ({ timer }) => {
    await timer.open();
    await timer.storeConfig({ styles: [{ id: "inactive", enabled: false }] });
    await timer.page.reload();
    await timer.scheduleAt("10:30");
    await timer.expectStyle("");
    await expect(timer.summary).toBeVisible();
  });

  test("goes away when the schedule is cancelled", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    await timer.click(timer.cancelSchedule);
    await timer.expectState("idle");
    await expect(timer.summary).toBeHidden();
  });

  test("updates when the duration changes", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    await timer.setMinutes(45);
    await expect(timer.summary.locator(".summary-duration")).toHaveText("Your 45 minute presentation");
  });
});
