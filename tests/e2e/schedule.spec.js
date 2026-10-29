import { test, expect, MORNING, HOUR, MINUTE, SECOND } from "./fixtures.js";

test.describe("schedule", () => {
  test("suggests the top of the next hour", async ({ timer }) => {
    await timer.open();
    await expect(timer.startTime).toHaveValue("11:00");
  });

  test("waits for a time later today and says when it will begin", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");

    await timer.expectState("waiting");
    await expect(timer.status).toHaveText("Timer will begin in 30 minutes.");
    await expect(timer.display).toHaveText("05:00");
    await expect(timer.cancelSchedule).toBeVisible();
  });

  test("stores the scheduled datetime in a cookie", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");

    const cookie = await timer.cookie("scheduledStart");
    expect(cookie).not.toBeNull();
    expect(Number(cookie.value)).toBe(MORNING.getTime() + 30 * MINUTE);
    expect(cookie.path).toBe("/");
    expect(cookie.sameSite).toBe("Lax");
    // Real-time expiry: after the timer would have ended, plus a minute of slack.
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 34 * 60);
  });

  test("schedules an earlier time for tomorrow", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("09:00");
    await expect(timer.status).toHaveText("Timer will begin in 23 hours.");
    expect(Number((await timer.cookie("scheduledStart")).value)).toBe(MORNING.getTime() + 23 * HOUR);
  });

  test("schedules the current minute for 24 hours from now", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:00");
    await expect(timer.status).toHaveText("Timer will begin in 24 hours.");
  });

  test("schedules across midnight", async ({ timer }) => {
    await timer.open(new Date("2026-10-28T23:50:00-04:00"));
    await timer.scheduleAt("00:05");
    await expect(timer.status).toHaveText("Timer will begin in 15 minutes.");
  });

  test("uses natural units as the start approaches", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("12:05");
    await expect(timer.status).toHaveText("Timer will begin in 2 hours and 5 minutes.");

    await timer.jump(HOUR);
    await expect(timer.status).toHaveText("Timer will begin in 1 hour and 5 minutes.");

    await timer.jump(HOUR + 3 * MINUTE + 30 * SECOND);
    await expect(timer.status).toHaveText("Timer will begin in 1 minute and 30 seconds.");

    await timer.jump(MINUTE);
    await expect(timer.status).toHaveText("Timer will begin in 30 seconds.");

    await timer.advance(29 * SECOND);
    await expect(timer.status).toHaveText("Timer will begin in 1 second.");
  });

  test("starts the timer at the scheduled time", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:01");

    await timer.jump(MINUTE - SECOND);
    await timer.expectState("waiting");
    await expect(timer.display).toHaveText("05:00");

    await timer.advance(SECOND);
    await timer.expectState("running");
    await expect(timer.status).toHaveText("");
    await expect(timer.cancelSchedule).toBeHidden();

    await timer.jump(MINUTE);
    await expect(timer.display).toHaveText("04:00");
  });

  test("counts from the scheduled time even if the tab was asleep when it passed", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:01");
    await timer.jump(3 * MINUTE);
    await timer.expectState("running");
    await expect(timer.display).toHaveText("03:00");
  });

  test("finishes immediately if the whole timer elapsed while the tab was asleep", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:01");
    await timer.jump(10 * MINUTE);
    await timer.expectState("finished");
    await expect(timer.display).toHaveText("00:00");
  });

  test("uses the duration set after scheduling", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:01");
    await timer.setMinutes(2);
    await timer.expectState("waiting");
    await expect(timer.display).toHaveText("02:00");

    await timer.jump(MINUTE);
    await timer.expectState("running");
    await expect(timer.display).toHaveText("02:00");
  });

  test("rescheduling replaces the previous schedule", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    await timer.scheduleAt("10:45");
    await expect(timer.status).toHaveText("Timer will begin in 45 minutes.");
    expect(Number((await timer.cookie("scheduledStart")).value)).toBe(MORNING.getTime() + 45 * MINUTE);
  });

  test("cancelling clears the schedule and the cookie", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    await timer.click(timer.cancelSchedule);

    await timer.expectState("idle");
    await expect(timer.status).toHaveText("");
    await expect(timer.cancelSchedule).toBeHidden();
    expect(await timer.cookie("scheduledStart")).toBeNull();

    await timer.jump(31 * MINUTE);
    await timer.expectState("idle");
  });

  test("starting now overrides a pending schedule", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30");
    await timer.click(timer.startPause);

    await timer.expectState("running");
    expect(await timer.cookie("scheduledStart")).toBeNull();
  });

  test("requires a time before scheduling", async ({ timer }) => {
    await timer.open();
    await timer.startTime.fill("");
    await timer.click(timer.scheduleButton);
    await timer.expectState("idle");
    expect(await timer.cookie("scheduledStart")).toBeNull();
  });

  test("ignores a submit without a valid time even if browser validation is bypassed", async ({ page, timer }) => {
    await timer.open();
    await page.evaluate(() => {
      document.getElementById("start-time").value = "";
      document.getElementById("schedule-form").dispatchEvent(new Event("submit", { cancelable: true }));
    });
    await timer.expectState("idle");
    expect(await timer.cookie("scheduledStart")).toBeNull();
  });

  test.describe("after a reload", () => {
    test("keeps waiting for the scheduled time", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30");
      await timer.jump(5 * MINUTE);

      await page.reload();
      await timer.expectState("waiting");
      await expect(timer.startTime).toHaveValue("10:30");
      await expect(timer.status).toHaveText("Timer will begin in 25 minutes.");
    });

    test("resumes a timer that is already running", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01");
      await timer.jump(3 * MINUTE);
      await expect(timer.display).toHaveText("03:00");

      await page.reload();
      await timer.expectState("running");
      await expect(timer.display).toHaveText("03:00");
    });

    test("is idle once the scheduled timer has finished", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01");
      await timer.jump(7 * MINUTE);
      await timer.expectState("finished");
      expect(await timer.cookie("scheduledStart")).toBeNull();

      await page.reload();
      await timer.expectState("idle");
    });

    test("does not resume a paused scheduled timer as running", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01");
      await timer.jump(2 * MINUTE);
      await timer.click(timer.startPause);
      await timer.expectState("paused");
      expect(await timer.cookie("scheduledStart")).toBeNull();

      await page.reload();
      await timer.expectState("idle");
    });
  });

  test.describe("with a saved cookie", () => {
    const setSchedule = (page, value) =>
      page.context().addCookies([{ name: "scheduledStart", value: String(value), url: page.url() }]);

    for (const [label, value] of [
      ["in the past", MORNING.getTime() - HOUR],
      ["more than a day ahead", MORNING.getTime() + 26 * HOUR],
      ["that is not a number", "soon"],
    ]) {
      test(`ignores and deletes a schedule ${label}`, async ({ page, timer }) => {
        await timer.open();
        await setSchedule(page, value);
        await page.reload();

        await timer.expectState("idle");
        await expect(timer.display).toHaveText("05:00");
        expect(await timer.cookie("scheduledStart")).toBeNull();
      });
    }

    test("resumes a timer that started while the page was closed", async ({ page, timer }) => {
      await timer.open();
      await setSchedule(page, MORNING.getTime() - 90 * SECOND);
      await page.reload();

      await timer.expectState("running");
      await expect(timer.display).toHaveText("03:30");
    });

    test("uses the saved duration when resuming", async ({ page, timer }) => {
      await timer.open();
      await page.context().addCookies([{ name: "timerMinutes", value: "10", url: page.url() }]);
      await setSchedule(page, MORNING.getTime() - 7 * MINUTE);
      await page.reload();

      await timer.expectState("running");
      await expect(timer.display).toHaveText("03:00");
    });
  });
});
