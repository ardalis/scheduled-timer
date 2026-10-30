import { test, expect, MORNING, MINUTE, SECOND, TimerPage } from "./fixtures.js";

test.describe("multiple talks", () => {
  test("lists each talk with its name, time, and duration, soonest first", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });
    await timer.scheduleAt("10:30", { name: "First", minutes: 20 });

    const rows = timer.talkList.locator("li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("10:30 AM TODAY");
    await expect(rows.nth(0)).toContainText("First");
    await expect(rows.nth(0)).toContainText("20 min");
    await expect(rows.nth(1)).toContainText("11:00 AM TODAY");
    await expect(rows.nth(1)).toContainText("Second");
    await expect(rows.nth(1)).toContainText("30 min");
  });

  test("waits for the soonest talk, showing its name and duration", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });
    await timer.scheduleAt("10:30", { name: "First", minutes: 20 });

    await timer.expectState("waiting");
    await expect(timer.display).toHaveText("20:00");
    await expect(timer.summary.locator(".summary-duration")).toHaveText("Your 20 minute presentation “First”");
    expect(Number((await timer.cookie("scheduledStart")).value)).toBe(MORNING.getTime() + 30 * MINUTE);
  });

  test("names the talk in the status line while waiting, running, and paused", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:01", { name: "Clean Code", minutes: 20 });
    await timer.jump(30 * SECOND);
    await expect(timer.status).toHaveText("Clean Code will begin in 30 seconds.");

    await timer.jump(30 * SECOND);
    await timer.expectState("running");
    await expect(timer.status).toHaveText("Clean Code");
    await expect(timer.display).toHaveText("20:00");

    await timer.click(timer.startPause);
    await expect(timer.status).toHaveText("Paused: Clean Code");
  });

  test("clears the name and duration fields once scheduled", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30", { name: "First", minutes: 20 });
    await expect(timer.talkName).toHaveValue("");
    await expect(timer.talkDuration).toHaveValue("");
  });

  test("treats a name as text, not markup", async ({ page, timer }) => {
    await timer.open();
    const name = '<img src=x onerror="window.hacked=1">';
    await timer.scheduleAt("10:30", { name });

    await expect(timer.talkList.locator(".talk-name")).toHaveText(name);
    await expect(timer.summary.locator(".summary-duration")).toContainText(name);
    await timer.jump(30 * MINUTE);
    await expect(timer.status).toHaveText(name);
    await expect(page.locator("img")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  });

  test.describe("overlaps", () => {
    for (const [label, time] of [
      ["starts during another talk", "10:45"],
      ["runs into another talk", "10:20"],
      ["starts at the same time", "10:30"],
    ]) {
      test(`rejects a talk that ${label}`, async ({ timer }) => {
        await timer.open();
        await timer.scheduleAt("10:30", { name: "First", minutes: 30 });
        await timer.scheduleAt(time, { name: "Second", minutes: 15 });

        await expect(timer.scheduleError).toHaveText(
          "That overlaps First (10:30 AM to 11:00 AM). Talks can't overlap, so choose another time or remove that talk."
        );
        await expect(timer.talkList.locator("li")).toHaveCount(1);
        await expect(timer.talkName).toHaveValue("Second");
        await expect(timer.display).toHaveText("30:00");
      });
    }

    test("rejects a talk overlapping the one running", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 30 });
      await timer.jump(2 * MINUTE);
      await timer.expectState("running");

      await timer.scheduleAt("10:15", { name: "Second" });
      await expect(timer.scheduleError).toContainText("overlaps First");
    });

    test("rejects a talk overlapping one that was paused and resumed", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 30 });
      await timer.jump(MINUTE);
      await timer.click(timer.startPause);
      await timer.click(timer.startPause);
      await timer.expectState("running");

      await timer.scheduleAt("10:15", { name: "Second" });
      await expect(timer.scheduleError).toContainText("overlaps First");
      await expect(timer.talkList.locator("li")).toHaveCount(0);
    });

    test("rejects a talk overlapping one that is paused", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 30 });
      await timer.jump(MINUTE);
      await timer.click(timer.startPause);
      await timer.expectState("paused");

      await timer.scheduleAt("10:15", { name: "Second" });
      await expect(timer.scheduleError).toContainText("overlaps First");
    });

    test("rejects a talk overlapping one that was started early", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 30 });
      await timer.click(timer.startPause);

      await timer.scheduleAt("10:05", { name: "Second" });
      await expect(timer.scheduleError).toContainText("overlaps First");
    });

    test("allows a talk once a paused one has no time left", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 1 });
      await timer.jump(3 * MINUTE);
      await timer.click(timer.startPause);
      await timer.expectState("paused");

      await timer.scheduleAt("10:30", { name: "Second" });
      await expect(timer.scheduleError).toBeHidden();
    });

    test("isn't blocked by an overlap in the stored list that doesn't involve the new talk", async ({ page, timer }) => {
      await timer.open();
      const start = MORNING.getTime() + 30 * MINUTE;
      await page.evaluate(
        (talks) => localStorage.setItem("scheduled-timer:talks", JSON.stringify(talks)),
        [{ name: "A", start, durationMinutes: 20 }, { name: "B", start: start + 10 * MINUTE, durationMinutes: 20 }]
      );
      await page.reload();

      await timer.scheduleAt("15:00", { name: "Later" });
      await expect(timer.scheduleError).toBeHidden();
      await expect(timer.talkList.locator("li")).toHaveCount(3);
    });

    test("uses the presentation duration for a talk without its own", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30");
      await timer.scheduleAt("10:34", { name: "Second" });
      await expect(timer.scheduleError).toHaveText(
        "That overlaps Untitled talk (10:30 AM to 10:35 AM). Talks can't overlap, so choose another time or remove that talk."
      );
    });

    test("allows a talk to start the moment another ends", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 30 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 15 });

      await expect(timer.scheduleError).toBeHidden();
      await expect(timer.talkList.locator("li")).toHaveCount(2);
    });

    test("clears the error when the form is edited", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30");
      await timer.scheduleAt("10:30");
      await expect(timer.scheduleError).toBeVisible();

      await timer.startTime.fill("11:00");
      await expect(timer.scheduleError).toBeHidden();
    });

    test("rejects a presentation duration that would make talks overlap", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First" });
      await timer.scheduleAt("10:40", { name: "Second" });

      await timer.openConfig();
      await timer.configDuration.fill("20");
      await timer.configSave.click();

      await expect(timer.configDialog.getByRole("alert")).toHaveText(
        "With that duration, First would overlap Second."
      );
      await expect(timer.configDialog).toBeVisible();
      await expect(timer.display).toHaveText("05:00");
    });

    test("allows any presentation duration when talks have their own", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 5 });
      await timer.scheduleAt("10:40", { name: "Second", minutes: 5 });

      await timer.setMinutes(60);
      await expect(timer.display).toHaveText("05:00");
    });
  });

  test("rejects an invalid duration", async ({ timer }) => {
    await timer.open();
    await timer.scheduleAt("10:30", { minutes: 0 });
    await expect(timer.scheduleError).toHaveText(
      "Enter a number of minutes greater than 0 and at most 1440, or leave it blank."
    );
    await timer.expectState("idle");
    await expect(timer.talkDuration).toBeFocused();
    await expect(timer.talkDuration).toHaveAttribute("aria-invalid", "true");

    await timer.talkDuration.fill("3");
    await expect(timer.talkDuration).toHaveAttribute("aria-invalid", "false");
  });

  test.describe("moving between talks", () => {
    test("waits for the next talk once one is stopped", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 1 });
      await timer.scheduleAt("11:30", { name: "Second", minutes: 7 });

      await timer.jump(MINUTE);
      await timer.expectState("running");
      await timer.jump(MINUTE + 60 * MINUTE);

      await timer.expectState("waiting");
      await expect(timer.display).toHaveText("07:00");
      await expect(timer.status).toContainText("Second will begin in");
      expect(Number((await timer.cookie("scheduledStart")).value)).toBe(MORNING.getTime() + 90 * MINUTE);
    });

    test("waits for a later talk if the tab slept through an earlier one and its hour over time", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 1 });
      await timer.scheduleAt("11:30", { name: "Second", minutes: 7 });

      await timer.jump(70 * MINUTE);
      await timer.expectState("waiting");
      await expect(timer.display).toHaveText("07:00");
      await expect(timer.talkList.locator("li")).toHaveCount(1);
    });

    test("restarting after a talk stops uses the presentation duration, not the talk's", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "Only", minutes: 20 });
      await timer.jump(MINUTE);
      await timer.expectState("running");
      await timer.jump(90 * MINUTE);
      await timer.expectState("stopped");

      await timer.click(timer.startPause);
      await timer.expectState("running");
      await expect(timer.display).toHaveText("05:00");
    });

    test("adding a talk while paused leaves the paused timer alone", async ({ timer }) => {
      await timer.open();
      await timer.click(timer.startPause);
      await timer.click(timer.startPause);
      await timer.expectState("paused");

      await timer.scheduleAt("10:30", { name: "First" });
      await timer.expectState("paused");
      await expect(timer.talkList.locator("li")).toHaveCount(1);
    });

    test("starts the next talk on time when the last one runs over", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 1 });
      await timer.scheduleAt("10:05", { name: "Second", minutes: 7 });

      await timer.jump(4 * MINUTE);
      await timer.expectState("running");
      await expect(timer.display).toHaveText("-02:00");

      await timer.jump(MINUTE);
      await timer.expectState("running");
      await expect(timer.display).toHaveText("07:00");
      await expect(timer.status).toHaveText("Second");
      expect(Number((await timer.cookie("scheduledStart")).value)).toBe(MORNING.getTime() + 5 * MINUTE);
    });

    test("starts the next talk on time when the last one is paused", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 2 });
      await timer.scheduleAt("10:05", { name: "Second", minutes: 7 });

      await timer.jump(MINUTE);
      await timer.click(timer.startPause);
      await timer.expectState("paused");

      await timer.jump(4 * MINUTE);
      await timer.expectState("running");
      await expect(timer.display).toHaveText("07:00");
    });

    test("starts a talk on time over a timer started by hand", async ({ timer }) => {
      await timer.open();
      await timer.click(timer.startPause);
      await timer.scheduleAt("10:02", { name: "First", minutes: 7 });
      // Adding it leaves the running timer alone.
      await timer.expectState("running");
      await timer.jump(MINUTE);
      await expect(timer.display).toHaveText("04:00");

      await timer.jump(MINUTE);
      await expect(timer.display).toHaveText("07:00");
      await expect(timer.status).toHaveText("First");
    });

    test("picks up the latest talk if several passed while the tab was asleep", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 1 });
      await timer.scheduleAt("10:05", { name: "Second", minutes: 10 });

      await timer.jump(7 * MINUTE);
      await timer.expectState("running");
      await expect(timer.status).toHaveText("Second");
      await expect(timer.display).toHaveText("08:00");
    });

    test("Start now runs the next talk early and keeps the later ones", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 20 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });

      await timer.click(timer.startPause);
      await timer.expectState("running");
      await expect(timer.display).toHaveText("20:00");
      await expect(timer.status).toHaveText("First");
      await expect(timer.talkList.locator("li")).toHaveCount(1);
      await expect(timer.talkList).toContainText("Second");
    });

    test("Reset moves on to the next talk", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 20 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });
      await timer.jump(MINUTE);
      await timer.expectState("running");

      await timer.resetTimer();
      await timer.expectState("waiting");
      await expect(timer.display).toHaveText("30:00");
      await expect(timer.status).toContainText("Second will begin in");
      expect(Number((await timer.cookie("scheduledStart")).value)).toBe(MORNING.getTime() + 60 * MINUTE);
    });

    test("cancelling the schedule moves on to the next talk", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 20 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });

      await expect(timer.cancelSchedule).toHaveText("Cancel next talk");
      await timer.click(timer.cancelSchedule);
      await timer.expectState("waiting");
      await expect(timer.display).toHaveText("30:00");
      await expect(timer.talkList.locator("li")).toHaveCount(1);
      await expect(timer.cancelSchedule).toHaveText("Cancel schedule");
      expect(Number((await timer.cookie("scheduledStart")).value)).toBe(MORNING.getTime() + 60 * MINUTE);
    });

    test("a double click on cancel removes only one talk", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First" });
      await timer.scheduleAt("11:00", { name: "Second" });
      await timer.scheduleAt("11:30", { name: "Third" });

      await timer.cancelSchedule.dblclick();
      await expect(timer.talkList.locator("li")).toHaveCount(2);
    });

    test("goes idle at the default duration after the last talk is reset", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "Only", minutes: 20 });
      await timer.jump(MINUTE);
      await timer.resetTimer();

      await timer.expectState("idle");
      await expect(timer.display).toHaveText("05:00");
      await expect(timer.status).toHaveText("");
    });
  });

  test.describe("removing", () => {
    const removeButton = (timer, name) => timer.talkList.getByRole("button", { name: `Remove ${name}`, exact: true });
    const openList = (timer) => timer.click(timer.talksToggle);

    test("removes a later talk, leaving the wait alone", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 20 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });

      await openList(timer);
      await timer.click(removeButton(timer, "Second"));
      await expect(timer.talkList.locator("li")).toHaveCount(1);
      await expect(timer.talksToggle).toHaveText("Upcoming talks (1)");
      await expect(timer.display).toHaveText("20:00");
    });

    test("removing the next talk moves on to the one after", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 20 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });

      await openList(timer);
      await timer.click(removeButton(timer, "First"));
      await expect(timer.display).toHaveText("30:00");
      expect(Number((await timer.cookie("scheduledStart")).value)).toBe(MORNING.getTime() + 60 * MINUTE);
    });

    test("removing the only talk goes idle", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 20 });

      await openList(timer);
      await timer.click(removeButton(timer, "First"));
      await timer.expectState("idle");
      await expect(timer.talksToggle).toBeHidden();
      expect(await timer.cookie("scheduledStart")).toBeNull();
    });

    test("removing from the keyboard keeps focus in the controls, where Enter can't remove another", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First" });
      await timer.scheduleAt("11:00", { name: "Second" });

      await openList(timer);
      await removeButton(timer, "First").focus();
      await page.keyboard.press("Enter");
      await expect(timer.controls).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(timer.talkList.locator("li")).toHaveCount(1);
    });

    test("a double click removes only one talk", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First" });
      await timer.scheduleAt("11:00", { name: "Second" });
      await timer.scheduleAt("11:30", { name: "Third" });

      await openList(timer);
      await removeButton(timer, "First").dblclick();
      await expect(timer.talkList.locator("li")).toHaveCount(2);
    });

    test("clears an overlap error once the talk in the way is removed", async ({ timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First" });
      await timer.scheduleAt("10:30", { name: "Second" });
      await expect(timer.scheduleError).toBeVisible();

      await openList(timer);
      await timer.click(removeButton(timer, "First"));
      await expect(timer.scheduleError).toBeHidden();
    });

    test("a mouse click doesn't leave a Remove button focused for a remote", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First" });
      await timer.scheduleAt("11:00", { name: "Second" });

      await openList(timer);
      await expect(timer.talksToggle).not.toBeFocused();
      await timer.click(removeButton(timer, "First"));
      await expect(removeButton(timer, "Second")).not.toBeFocused();
      await page.keyboard.press("Enter");
      await expect(timer.talkList.locator("li")).toHaveCount(1);
    });
  });

  test.describe("after a reload", () => {
    test("keeps every talk and keeps waiting for the next", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:30", { name: "First", minutes: 20 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });

      await page.reload();
      await timer.expectState("waiting");
      await expect(timer.startTime).toHaveValue("10:30");
      await expect(timer.display).toHaveText("20:00");
      await expect(timer.talkList.locator("li")).toHaveCount(2);
    });

    test("resumes a running talk with its own name and duration", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 20 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });
      await timer.jump(3 * MINUTE);
      await expect(timer.display).toHaveText("18:00");

      await page.reload();
      await timer.expectState("running");
      await expect(timer.display).toHaveText("18:00");
      await expect(timer.status).toHaveText("First");
      await expect(timer.talkList.locator("li")).toHaveCount(1);
    });

    test("resumes a talk running longer than the presentation duration allows", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "Long", minutes: 120 });
      // Past the point a 5 minute timer would have stopped.
      await timer.jump(90 * MINUTE);

      await page.reload();
      await timer.expectState("running");
      await expect(timer.status).toHaveText("Long");
      await expect(timer.display).toHaveText("31:00");
    });

    test("doesn't bring back a talk that was paused", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 20 });
      await timer.scheduleAt("11:00", { name: "Second", minutes: 30 });
      await timer.jump(MINUTE);
      await timer.click(timer.startPause);
      await timer.expectState("paused");

      await page.reload();
      await timer.expectState("waiting");
      await expect(timer.display).toHaveText("30:00");
    });

    test("drops talks that finished while the page was closed", async ({ page, timer }) => {
      await timer.open();
      await page.evaluate(
        ([start]) => localStorage.setItem("scheduled-timer:talks", JSON.stringify([{ name: "Old", start, durationMinutes: 5 }])),
        [MORNING.getTime() - 2 * 60 * MINUTE]
      );
      await page.reload();
      await timer.expectState("idle");
      await expect(timer.talksToggle).toBeHidden();
    });

    test("waits for the next talk after one has stopped", async ({ page, timer }) => {
      await timer.open();
      await timer.scheduleAt("10:01", { name: "First", minutes: 1 });
      await timer.scheduleAt("11:30", { name: "Second", minutes: 7 });
      await timer.jump(70 * MINUTE);
      await timer.expectState("waiting");

      await page.reload();
      await timer.expectState("waiting");
      await expect(timer.display).toHaveText("07:00");
      await expect(timer.status).toContainText("Second will begin in");
    });

    test("ignores a corrupt talk list", async ({ page, timer }) => {
      await timer.open();
      await page.evaluate(() => localStorage.setItem("scheduled-timer:talks", "{oops"));
      await page.reload();
      await timer.expectState("idle");
    });
  });

  test("keeps the list in step across tabs, so a stale tab can't lose a talk", async ({ page, timer }) => {
    await timer.open();
    await timer.scheduleAt("10:01", { name: "First", minutes: 1 });

    const other = new TimerPage(await page.context().newPage());
    await other.page.goto("/");
    await other.scheduleAt("11:00", { name: "Second", minutes: 30 });
    await expect(timer.talkList.locator("li")).toHaveCount(2);

    // This tab saves the list when First begins; Second has to still be in it.
    await timer.jump(MINUTE);
    await timer.expectState("running");
    await page.reload();
    await expect(timer.talkList.locator("li")).toHaveCount(1);
    await expect(timer.talkList).toContainText("Second");
  });

  test("warns when talks can't be saved, and still keeps the next one across a reload", async ({ page, timer }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access denied", "SecurityError");
        },
      });
    });
    await timer.open();
    await timer.scheduleAt("10:30", { name: "First", minutes: 20 });
    await expect(timer.scheduleError).toContainText("couldn't be saved");
    await timer.expectState("waiting");

    await page.reload();
    await timer.expectState("waiting");
    await expect(timer.status).toHaveText("Timer will begin in 30 minutes.");
  });
});
