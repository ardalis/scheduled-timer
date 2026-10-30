import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  DEFAULT_MINUTES,
  MAX_SCHEDULE_AHEAD_MS,
  defaultStartTimeValue,
  describeDay,
  formatClock,
  formatTimespan,
  nextOccurrence,
  parseCookie,
  parseTimeInput,
  restoreSchedule,
  scheduleCookieMaxAge,
  scheduleSummary,
  isStopped,
  MAX_OVERTIME_MS,
  toTimeInputValue,
} from "../../public/timer-core.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

// Local-time constructor, so these tests hold in any time zone.
const local = (y, mo, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms);

describe("nextOccurrence", () => {
  it("returns today when the time is later today", () => {
    const now = local(2026, 10, 28, 10, 0);
    assert.deepEqual(nextOccurrence(10, 30, now), local(2026, 10, 28, 10, 30));
  });

  it("returns tomorrow when the time has already passed today", () => {
    const now = local(2026, 10, 28, 10, 0);
    assert.deepEqual(nextOccurrence(9, 0, now), local(2026, 10, 29, 9, 0));
  });

  it("treats the current minute as passed, scheduling 24 hours out", () => {
    const now = local(2026, 10, 28, 10, 0);
    assert.deepEqual(nextOccurrence(10, 0, now), local(2026, 10, 29, 10, 0));
  });

  it("schedules a time a few seconds into the current minute for tomorrow", () => {
    const now = local(2026, 10, 28, 10, 0, 1);
    assert.deepEqual(nextOccurrence(10, 0, now), local(2026, 10, 29, 10, 0));
  });

  it("schedules the next minute even when it is less than a minute away", () => {
    const now = local(2026, 10, 28, 10, 0, 59, 999);
    assert.deepEqual(nextOccurrence(10, 1, now), local(2026, 10, 28, 10, 1));
  });

  it("rolls over midnight", () => {
    const now = local(2026, 10, 28, 23, 50);
    assert.deepEqual(nextOccurrence(0, 5, now), local(2026, 10, 29, 0, 5));
  });

  it("rolls over the end of a month and year", () => {
    const now = local(2026, 12, 31, 22, 0);
    assert.deepEqual(nextOccurrence(8, 0, now), local(2027, 1, 1, 8, 0));
  });

  it("handles leap days", () => {
    const now = local(2028, 2, 28, 12, 0);
    assert.deepEqual(nextOccurrence(9, 0, now), local(2028, 2, 29, 9, 0));
  });

  it("zeroes seconds and milliseconds", () => {
    const now = local(2026, 10, 28, 10, 0, 42, 123);
    const result = nextOccurrence(11, 15, now);
    assert.equal(result.getSeconds(), 0);
    assert.equal(result.getMilliseconds(), 0);
  });

  it("is always in the future and within 24 hours", () => {
    const now = local(2026, 10, 28, 13, 37, 12);
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 15, 37, 38, 59]) {
        const delta = nextOccurrence(h, m, now) - now;
        assert.ok(delta > 0 && delta <= DAY_MS, `${h}:${m} -> ${delta}`);
      }
    }
  });

  it("does not mutate the `now` argument", () => {
    const now = local(2026, 10, 28, 10, 0);
    const copy = new Date(now);
    nextOccurrence(9, 0, now);
    assert.deepEqual(now, copy);
  });

  it("defaults `now` to the current time", () => {
    const before = Date.now();
    const result = nextOccurrence(0, 0);
    assert.ok(result > before && result - before <= DAY_MS);
  });
});

describe("formatClock", () => {
  it("formats the default duration", () => {
    assert.equal(formatClock(DEFAULT_MINUTES * MINUTE), "05:00");
  });

  it("pads minutes and seconds", () => {
    assert.equal(formatClock(MINUTE + 5 * SECOND), "01:05");
  });

  it("rounds partial seconds up so 00:00 only shows at the end", () => {
    assert.equal(formatClock(4 * MINUTE + 59 * SECOND + 1), "05:00");
    assert.equal(formatClock(1), "00:01");
    assert.equal(formatClock(0), "00:00");
  });

  it("keeps 00:00 for the first second over time", () => {
    assert.equal(formatClock(-1), "00:00");
    assert.equal(formatClock(-999), "00:00");
  });

  it("shows over time as negative", () => {
    assert.equal(formatClock(-SECOND), "-00:01");
    assert.equal(formatClock(-5 * SECOND - 1), "-00:05");
    assert.equal(formatClock(-(MINUTE + 5 * SECOND)), "-01:05");
    assert.equal(formatClock(-(59 * MINUTE + 59 * SECOND)), "-59:59");
  });

  it("shows an hour or more over time as -hh:mm:ss", () => {
    assert.equal(formatClock(-HOUR), "-01:00:00");
    assert.equal(formatClock(-(2 * HOUR + 3 * SECOND)), "-02:00:03");
  });

  it("uses mm:ss under an hour", () => {
    assert.equal(formatClock(59 * MINUTE + 59 * SECOND), "59:59");
    // A partial second under the hour still rounds up to the hour.
    assert.equal(formatClock(HOUR - 1), "01:00:00");
  });

  it("uses hh:mm:ss from an hour up", () => {
    assert.equal(formatClock(HOUR), "01:00:00");
    assert.equal(formatClock(HOUR + 1), "01:00:01");
    assert.equal(formatClock(90 * MINUTE), "01:30:00");
    assert.equal(formatClock(10 * HOUR + 5 * MINUTE + 7 * SECOND), "10:05:07");
    assert.equal(formatClock(24 * HOUR), "24:00:00");
  });
});

describe("formatTimespan", () => {
  const cases = [
    [0, "less than a second"],
    [-10 * SECOND, "less than a second"],
    [1, "1 second"],
    [SECOND, "1 second"],
    [45 * SECOND, "45 seconds"],
    [MINUTE, "1 minute"],
    [MINUTE + SECOND, "1 minute and 1 second"],
    [5 * MINUTE + 30 * SECOND, "5 minutes and 30 seconds"],
    [59 * MINUTE + 59 * SECOND, "59 minutes and 59 seconds"],
    [HOUR, "1 hour"],
    // Seconds are dropped once the span is an hour or more.
    [HOUR + 30 * SECOND, "1 hour"],
    [HOUR + MINUTE, "1 hour and 1 minute"],
    [2 * HOUR + 5 * MINUTE + 9 * SECOND, "2 hours and 5 minutes"],
    [23 * HOUR + 59 * MINUTE + 59 * SECOND, "23 hours and 59 minutes"],
    [DAY_MS, "24 hours"],
  ];

  for (const [ms, expected] of cases) {
    it(`${ms} ms -> "${expected}"`, () => {
      assert.equal(formatTimespan(ms), expected);
    });
  }

  it("rounds partial seconds up, matching the clock", () => {
    assert.equal(formatTimespan(29 * MINUTE + 59 * SECOND + 1), "30 minutes");
  });
});

describe("parseTimeInput", () => {
  it("parses HH:MM", () => {
    assert.deepEqual(parseTimeInput("09:05"), { hours: 9, minutes: 5 });
    assert.deepEqual(parseTimeInput("00:00"), { hours: 0, minutes: 0 });
    assert.deepEqual(parseTimeInput("23:59"), { hours: 23, minutes: 59 });
  });

  it("accepts and ignores seconds", () => {
    assert.deepEqual(parseTimeInput("14:30:15"), { hours: 14, minutes: 30 });
    assert.deepEqual(parseTimeInput("14:30:15.250"), { hours: 14, minutes: 30 });
  });

  it("rejects empty, malformed, and out-of-range values", () => {
    for (const value of ["", null, undefined, "9:05", "24:00", "12:60", "ab:cd", "12-30", " 12:30"]) {
      assert.equal(parseTimeInput(value), null, String(value));
    }
  });
});

describe("toTimeInputValue / defaultStartTimeValue", () => {
  it("formats a date as HH:MM", () => {
    assert.equal(toTimeInputValue(local(2026, 10, 28, 7, 3)), "07:03");
    assert.equal(toTimeInputValue(local(2026, 10, 28, 23, 59, 59)), "23:59");
  });

  it("suggests the top of the next hour", () => {
    assert.equal(defaultStartTimeValue(local(2026, 10, 28, 10, 0)), "11:00");
    assert.equal(defaultStartTimeValue(local(2026, 10, 28, 10, 59)), "11:00");
    assert.equal(defaultStartTimeValue(local(2026, 10, 28, 23, 30)), "00:00");
  });

  it("defaults to the current time", () => {
    assert.match(defaultStartTimeValue(), /^\d{2}:00$/);
  });
});

describe("parseCookie", () => {
  const cookies = "theme=dark; scheduledStart=1793196000000; timerMinutes=10; note=a%20b";

  it("finds a cookie by name", () => {
    assert.equal(parseCookie(cookies, "scheduledStart"), "1793196000000");
    assert.equal(parseCookie(cookies, "theme"), "dark");
  });

  it("decodes values", () => {
    assert.equal(parseCookie(cookies, "note"), "a b");
  });

  it("does not match on a name prefix or suffix", () => {
    assert.equal(parseCookie("xscheduledStart=1; scheduledStartX=2", "scheduledStart"), null);
  });

  it("handles cookies separated without a space", () => {
    assert.equal(parseCookie("a=1;timerMinutes=7", "timerMinutes"), "7");
  });

  it("returns null when missing or the cookie string is empty", () => {
    assert.equal(parseCookie(cookies, "missing"), null);
    assert.equal(parseCookie("", "theme"), null);
    assert.equal(parseCookie(undefined, "theme"), null);
  });

  it("returns an empty string for an empty value", () => {
    assert.equal(parseCookie("scheduledStart=", "scheduledStart"), "");
  });

  it("returns null instead of throwing on malformed encoding", () => {
    assert.equal(parseCookie("note=%E0%A4%A", "note"), null);
  });
});

describe("scheduleCookieMaxAge", () => {
  const now = local(2026, 10, 28, 10, 0).getTime();

  it("lasts until a minute after the timer would stop, an hour over time", () => {
    const start = now + 30 * MINUTE;
    assert.equal(scheduleCookieMaxAge(start, 5 * MINUTE, now), (35 + 60) * 60 + 60);
  });

  it("is never less than a minute", () => {
    assert.equal(scheduleCookieMaxAge(now - 3 * HOUR, 5 * MINUTE, now), 60);
  });
});

describe("restoreSchedule", () => {
  const now = local(2026, 10, 28, 10, 0).getTime();
  const duration = 5 * MINUTE;

  it("does nothing without a saved value", () => {
    assert.deepEqual(restoreSchedule(null, duration, now), { mode: "none", stale: false });
    assert.deepEqual(restoreSchedule("", duration, now), { mode: "none", stale: false });
  });

  it("resumes waiting for a future start", () => {
    const start = now + 30 * MINUTE;
    assert.deepEqual(restoreSchedule(String(start), duration, now), { mode: "waiting", start });
  });

  it("accepts a start as far ahead as a schedule can be", () => {
    assert.equal(restoreSchedule(String(now + DAY_MS), duration, now).mode, "waiting");
    assert.equal(restoreSchedule(String(now + MAX_SCHEDULE_AHEAD_MS), duration, now).mode, "waiting");
  });

  it("discards a start further ahead than any schedule", () => {
    assert.deepEqual(restoreSchedule(String(now + MAX_SCHEDULE_AHEAD_MS + 1), duration, now), {
      mode: "none",
      stale: true,
    });
  });

  it("resumes a timer that started while the page was closed", () => {
    const start = now - 2 * MINUTE;
    assert.deepEqual(restoreSchedule(String(start), duration, now), {
      mode: "running",
      endTime: start + duration,
    });
  });

  it("treats a start of exactly now as running", () => {
    assert.deepEqual(restoreSchedule(String(now), duration, now), { mode: "running", endTime: now + duration });
  });

  it("resumes a timer that is over time", () => {
    const start = now - duration - 10 * MINUTE;
    assert.deepEqual(restoreSchedule(String(start), duration, now), { mode: "running", endTime: start + duration });
  });

  it("resumes a timer that reached zero exactly now", () => {
    const start = now - duration;
    assert.deepEqual(restoreSchedule(String(start), duration, now), { mode: "running", endTime: now });
  });

  it("discards a timer that has stopped an hour over time", () => {
    const stoppedNow = now - duration - MAX_OVERTIME_MS;
    assert.deepEqual(restoreSchedule(String(stoppedNow), duration, now), { mode: "none", stale: true });
    assert.equal(restoreSchedule(String(stoppedNow + 1), duration, now).mode, "running");
    assert.deepEqual(restoreSchedule(String(now - DAY_MS), duration, now), { mode: "none", stale: true });
  });

  it("discards garbage values", () => {
    for (const value of ["abc", "0", "-5", "NaN", "Infinity"]) {
      assert.deepEqual(restoreSchedule(value, duration, now), { mode: "none", stale: true }, value);
    }
  });
});

describe("isStopped", () => {
  it("keeps counting until an hour over time", () => {
    assert.equal(isStopped(5 * MINUTE), false);
    assert.equal(isStopped(0), false);
    assert.equal(isStopped(-30 * MINUTE), false);
    assert.equal(isStopped(-MAX_OVERTIME_MS + 1), false);
  });

  it("stops at an hour over time", () => {
    assert.equal(MAX_OVERTIME_MS, HOUR);
    assert.equal(isStopped(-HOUR), true);
    assert.equal(isStopped(-2 * HOUR), true);
  });
});

describe("describeDay", () => {
  const now = new Date(2026, 9, 28, 22, 0);
  it("says today, tomorrow, or the weekday by local date", () => {
    assert.equal(describeDay(new Date(2026, 9, 28, 23, 59), now), "TODAY");
    assert.equal(describeDay(new Date(2026, 9, 29, 0, 1), now), "TOMORROW");
    assert.equal(describeDay(new Date(2026, 9, 30, 9, 0), now), "FRIDAY");
  });
});

describe("scheduleSummary", () => {
  const now = new Date(2026, 9, 28, 10, 0).getTime();
  const formatTime = (date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;

  it("summarizes the duration, start, and time until it", () => {
    const start = new Date(2026, 9, 28, 10, 30).getTime();
    assert.deepEqual(scheduleSummary(20, start, now + SECOND, formatTime), [
      "Your 20 minute presentation",
      "is scheduled for",
      "10:30 TODAY",
      "29:59 minutes to go!",
    ]);
  });

  it("handles fractional durations, tomorrow, and an hour or more to go", () => {
    const start = new Date(2026, 9, 29, 9, 0).getTime();
    const [duration, , when, countdown] = scheduleSummary(7.5, start, now, formatTime);
    assert.equal(duration, "Your 7.5 minute presentation");
    assert.equal(when, "9:00 TOMORROW");
    assert.equal(countdown, "23:00:00 hours to go!");
  });

  it("never counts below zero", () => {
    assert.equal(scheduleSummary(5, now, now + SECOND, formatTime)[3], "00:00 minutes to go!");
  });

  it("names the talk when it has a name", () => {
    const now = Date.now();
    assert.equal(scheduleSummary(20, now, now, formatTime, "Clean Code")[0], "Your 20 minute presentation “Clean Code”");
    assert.equal(scheduleSummary(20, now, now, formatTime, "")[0], "Your 20 minute presentation");
  });
});
