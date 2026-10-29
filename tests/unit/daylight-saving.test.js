// Daylight saving edge cases need a zone that observes DST. Node picks up a
// change to process.env.TZ immediately, and each test file runs in its own process.
process.env.TZ = "America/New_York";

const { describe, it } = await import("node:test");
const { default: assert } = await import("node:assert/strict");
const { DAY_MS, MAX_SCHEDULE_AHEAD_MS, nextOccurrence, restoreSchedule } = await import(
  "../../public/timer-core.js"
);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("nextOccurrence across daylight saving changes (America/New_York)", () => {
  it("schedules across spring forward with fewer real hours", () => {
    // 2026-03-08 02:00 EST jumps to 03:00 EDT.
    const now = new Date("2026-03-07T20:00:00-05:00");
    const result = nextOccurrence(9, 0, now);
    assert.equal(result.toISOString(), new Date("2026-03-08T09:00:00-04:00").toISOString());
    assert.equal(result - now, 12 * HOUR);
  });

  it("rolls a skipped spring-forward time forward an hour", () => {
    const now = new Date("2026-03-07T23:00:00-05:00");
    const result = nextOccurrence(2, 30, now);
    assert.equal(result.toISOString(), new Date("2026-03-08T03:30:00-04:00").toISOString());
    assert.ok(result - now > 0 && result - now <= DAY_MS);
  });

  it("schedules across fall back with more real hours", () => {
    // 2026-11-01 02:00 EDT falls back to 01:00 EST.
    const now = new Date("2026-10-31T20:00:00-04:00");
    const result = nextOccurrence(9, 0, now);
    assert.equal(result.toISOString(), new Date("2026-11-01T09:00:00-05:00").toISOString());
    assert.equal(result - now, 14 * HOUR);
  });

  it("picks the first occurrence of a repeated time when both are ahead", () => {
    const now = new Date("2026-10-31T23:00:00-04:00");
    const result = nextOccurrence(1, 30, now);
    assert.equal(result.toISOString(), new Date("2026-11-01T01:30:00-04:00").toISOString());
  });

  it("picks the second occurrence of a repeated time once the first has passed", () => {
    // 01:45 EDT: the first 01:40 has passed, the second (EST) is 55 minutes away.
    const now = new Date("2026-11-01T01:45:00-04:00");
    const result = nextOccurrence(1, 40, now);
    assert.equal(result.toISOString(), new Date("2026-11-01T01:40:00-05:00").toISOString());
    assert.equal(result - now, 55 * MINUTE);
  });

  it("goes to the next day once both occurrences of a repeated time have passed", () => {
    const now = new Date("2026-11-01T01:45:00-05:00");
    const result = nextOccurrence(1, 40, now);
    assert.equal(result.toISOString(), new Date("2026-11-02T01:40:00-05:00").toISOString());
    assert.ok(result - now <= DAY_MS);
  });

  it("needs up to 25 hours when a just-passed time comes round after fall back", () => {
    // 00:35 EDT on fall-back day: the next 00:30 is the following day, 24h55m away.
    const now = new Date("2026-11-01T00:35:00-04:00");
    const result = nextOccurrence(0, 30, now);
    assert.equal(result.toISOString(), new Date("2026-11-02T00:30:00-05:00").toISOString());
    assert.equal(result - now, 24 * HOUR + 55 * MINUTE);
    // ...and reloading the page keeps that schedule.
    assert.equal(restoreSchedule(String(result.getTime()), 5 * MINUTE, now.getTime()).mode, "waiting");
  });

  it("returns the earliest future instant showing that time, for every minute of both transition days", () => {
    for (const day of ["2026-03-08T00:00:00-05:00", "2026-11-01T00:00:00-04:00"]) {
      const start = new Date(day).getTime();
      for (let offset = 0; offset < 25 * HOUR; offset += 7 * MINUTE) {
        const now = new Date(start + offset);
        for (const [h, m] of [[0, 30], [1, 30], [2, 30], [3, 0], [12, 0]]) {
          const result = nextOccurrence(h, m, now);
          const label = `${now.toISOString()} ${h}:${m} -> ${result.toISOString()}`;
          assert.ok(result > now && result - now <= MAX_SCHEDULE_AHEAD_MS, label);
          // No earlier minute boundary after `now` reads h:m on the local clock
          // (a skipped time is the exception: it rolls forward).
          for (let t = Math.ceil((now.getTime() + 1) / MINUTE) * MINUTE; t < result; t += MINUTE) {
            const d = new Date(t);
            assert.ok(!(d.getHours() === h && d.getMinutes() === m), `${label}: earlier match ${d.toISOString()}`);
          }
        }
      }
    }
  });
});
