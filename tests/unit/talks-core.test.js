import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findConflict,
  findOverlap,
  lastStarted,
  loadTalks,
  MAX_TALK_NAME_LENGTH,
  normalizeTalks,
  restoreTalks,
  saveTalks,
  sortTalks,
  talkDurationMs,
  talkLabel,
  TALKS_KEY,
} from "../../public/talks-core.js";
import { MAX_OVERTIME_MS } from "../../public/timer-core.js";

const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 9, 28, 14, 0);
const DEFAULT_MS = 5 * MINUTE;

const talk = (offsetMinutes, durationMinutes = null, name = "") => ({
  name,
  start: NOW + offsetMinutes * MINUTE,
  durationMinutes,
});

describe("talkDurationMs", () => {
  it("uses the talk's own duration", () => {
    assert.equal(talkDurationMs(talk(0, 20), DEFAULT_MS), 20 * MINUTE);
  });

  it("rounds a fractional duration to the millisecond", () => {
    assert.equal(talkDurationMs(talk(0, 1 / 60), DEFAULT_MS), 1000);
  });

  it("falls back to the default without a duration or a talk", () => {
    assert.equal(talkDurationMs(talk(0), DEFAULT_MS), DEFAULT_MS);
    assert.equal(talkDurationMs(null, DEFAULT_MS), DEFAULT_MS);
  });
});

describe("talkLabel", () => {
  it("uses the name, or a placeholder without one", () => {
    assert.equal(talkLabel(talk(0, null, "Clean Code")), "Clean Code");
    assert.equal(talkLabel(talk(0)), "Untitled talk");
  });
});

describe("sortTalks", () => {
  it("sorts by start without changing the original", () => {
    const talks = [talk(10), talk(5)];
    assert.deepEqual(sortTalks(talks), [talk(5), talk(10)]);
    assert.deepEqual(talks, [talk(10), talk(5)]);
  });
});

describe("normalizeTalks", () => {
  it("returns no talks for anything but a list", () => {
    for (const raw of [null, undefined, "talks", 3, {}]) assert.deepEqual(normalizeTalks(raw), []);
  });

  it("drops entries without a usable start", () => {
    const raw = [null, "x", {}, { start: "soon" }, { start: -1 }, { start: 0 }, { start: Infinity }];
    assert.deepEqual(normalizeTalks(raw), []);
  });

  it("sorts talks and fills in missing fields", () => {
    assert.deepEqual(normalizeTalks([talk(10, 20, "B"), { start: NOW }]), [talk(0), talk(10, 20, "B")]);
  });

  it("trims and limits names, and ignores any other type", () => {
    const [long, spaced, numeric] = normalizeTalks([
      { start: 1, name: "x".repeat(MAX_TALK_NAME_LENGTH + 5) },
      { start: 2, name: "  Clean Code  " },
      { start: 3, name: 7 },
    ]);
    assert.equal(long.name.length, MAX_TALK_NAME_LENGTH);
    assert.equal(spaced.name, "Clean Code");
    assert.equal(numeric.name, "");
  });

  it("treats an invalid duration as none of its own", () => {
    for (const durationMinutes of [0, -5, "soon", 100000]) {
      assert.equal(normalizeTalks([{ start: 1, durationMinutes }])[0].durationMinutes, null);
    }
  });

  it("drops properties it doesn't know", () => {
    assert.deepEqual(normalizeTalks([{ ...talk(0), extra: true }]), [talk(0)]);
  });
});

describe("loadTalks and saveTalks", () => {
  const memoryStorage = () => {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  };
  const throwingStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  it("round-trips talks", () => {
    const storage = memoryStorage();
    assert.equal(saveTalks(storage, [talk(0, 20, "A")]), true);
    assert.deepEqual(loadTalks(storage), [talk(0, 20, "A")]);
  });

  it("has no talks when nothing is stored, or it's corrupt", () => {
    const storage = memoryStorage();
    assert.deepEqual(loadTalks(storage), []);
    storage.setItem(TALKS_KEY, "{oops");
    assert.deepEqual(loadTalks(storage), []);
  });

  it("copes with storage being unavailable", () => {
    assert.deepEqual(loadTalks(null), []);
    assert.deepEqual(loadTalks(throwingStorage), []);
    assert.equal(saveTalks(null, []), false);
    assert.equal(saveTalks(throwingStorage, []), false);
  });
});

describe("findOverlap", () => {
  it("finds no overlap in an empty list or a single talk", () => {
    assert.equal(findOverlap([], DEFAULT_MS), null);
    assert.equal(findOverlap([talk(0, 60)], DEFAULT_MS), null);
  });

  it("allows one talk to start the moment another ends", () => {
    assert.equal(findOverlap([talk(0, 30), talk(30, 10)], DEFAULT_MS), null);
  });

  it("finds a talk starting a moment before another ends", () => {
    const first = talk(0, 30);
    const second = { ...talk(30, 10), start: NOW + 30 * MINUTE - 1 };
    assert.deepEqual(findOverlap([first, second], DEFAULT_MS), [first, second]);
  });

  it("returns the pair in time order, whatever the order given", () => {
    const first = talk(0, 30);
    const second = talk(10, 5);
    assert.deepEqual(findOverlap([second, first], DEFAULT_MS), [first, second]);
  });

  it("treats talks with the same start as overlapping", () => {
    const [a, b] = [talk(0, 5), talk(0, 5)];
    assert.deepEqual(findOverlap([a, b], DEFAULT_MS), [a, b]);
  });

  it("finds a long talk spanning several others", () => {
    const long = talk(0, 60);
    const [inner] = [talk(10, 5), talk(20, 5)];
    assert.deepEqual(findOverlap([long, inner, talk(20, 5)], DEFAULT_MS), [long, inner]);
  });

  it("uses the default for a talk without its own duration", () => {
    const [a, b] = [talk(0), talk(4)];
    assert.deepEqual(findOverlap([a, b], DEFAULT_MS), [a, b]);
    assert.equal(findOverlap([a, b], 4 * MINUTE), null);
  });
});

describe("findConflict", () => {
  it("finds a talk the new one overlaps, whichever comes first", () => {
    const other = talk(10, 10);
    assert.equal(findConflict(talk(15, 5), [other], DEFAULT_MS), other);
    assert.equal(findConflict(talk(5, 10), [other], DEFAULT_MS), other);
  });

  it("allows talks that only touch", () => {
    const other = talk(10, 10);
    assert.equal(findConflict(talk(20, 5), [other], DEFAULT_MS), null);
    assert.equal(findConflict(talk(5, 5), [other], DEFAULT_MS), null);
  });

  it("ignores overlaps that don't involve the new talk", () => {
    assert.equal(findConflict(talk(100, 5), [talk(0, 30), talk(10, 30)], DEFAULT_MS), null);
  });

  it("uses the default for a talk without its own duration", () => {
    const other = talk(0);
    assert.equal(findConflict(talk(4, 1), [other], DEFAULT_MS), other);
    assert.equal(findConflict(talk(5, 1), [other], DEFAULT_MS), null);
  });
});

describe("lastStarted", () => {
  const talks = [talk(-10), talk(0), talk(10)];

  it("is the latest talk at or before now", () => {
    assert.equal(lastStarted(talks, NOW), talks[1]);
    assert.equal(lastStarted(talks, NOW - 1), talks[0]);
  });

  it("is null before any talk has started", () => {
    assert.equal(lastStarted(talks, NOW - 11 * MINUTE), null);
    assert.equal(lastStarted([], NOW), null);
  });
});

describe("restoreTalks", () => {
  const restore = (stored, cookie = null) => restoreTalks(stored, cookie, DEFAULT_MS, NOW);

  it("keeps talks yet to start, and ones still running or over time", () => {
    const talks = [talk(-30, 20), talk(-5, 20), talk(30)];
    assert.deepEqual(restore(talks), talks);
  });

  it("drops talks that have stopped", () => {
    const start = NOW - 20 * MINUTE - MAX_OVERTIME_MS;
    assert.deepEqual(restore([{ name: "", start, durationMinutes: 20 }]), []);
    assert.equal(restore([{ name: "", start: start + 1, durationMinutes: 20 }]).length, 1);
  });

  it("drops talks further ahead than a schedule can be", () => {
    assert.deepEqual(restore([talk(26 * 60)]), []);
  });

  it("adds a schedule found only in the cookie", () => {
    assert.deepEqual(restore([talk(30, 20, "A")], String(NOW + 10 * MINUTE)), [talk(10), talk(30, 20, "A")]);
  });

  it("doesn't duplicate a talk the cookie mirrors", () => {
    assert.deepEqual(restore([talk(10, 20, "A")], String(NOW + 10 * MINUTE)), [talk(10, 20, "A")]);
  });

  it("goes by the talk's own duration, not the default, when the cookie mirrors it", () => {
    const running = talk(-90, 120, "Long");
    assert.deepEqual(restore([running], String(running.start)), [running]);
    // A stopped talk stays stopped, rather than coming back from its cookie.
    const stopped = talk(-61, 1);
    assert.deepEqual(restoreTalks([stopped], String(stopped.start), 60 * MINUTE, NOW), []);
  });

  it("ignores an unusable cookie", () => {
    for (const cookie of ["soon", "", String(NOW - 3 * MAX_OVERTIME_MS), String(NOW + 26 * 60 * MINUTE)]) {
      assert.deepEqual(restore([], cookie), []);
    }
  });
});
