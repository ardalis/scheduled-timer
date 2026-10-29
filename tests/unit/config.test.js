import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG_KEY,
  MAX_DURATION_MINUTES,
  defaultConfig,
  formatDurationMinutes,
  hasStoredConfig,
  loadConfig,
  normalizeConfig,
  parseDurationMinutes,
  saveConfig,
} from "../../public/config.js";
import { defaultStyles } from "../../public/styles-core.js";

const withDefaults = (overrides) => ({ ...defaultConfig(), ...overrides });

/** Minimal in-memory stand-in for localStorage. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

const throwingStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

describe("defaultConfig", () => {
  it("defaults to a 5 minute timer with the built-in styles", () => {
    assert.deepEqual(defaultConfig(), { durationMinutes: 5, styles: defaultStyles() });
  });

  it("returns a fresh object each time", () => {
    const a = defaultConfig();
    a.durationMinutes = 10;
    assert.equal(defaultConfig().durationMinutes, 5);
  });
});

describe("parseDurationMinutes", () => {
  it("accepts whole numbers", () => {
    assert.equal(parseDurationMinutes(1), 1);
    assert.equal(parseDurationMinutes("20"), 20);
    assert.equal(parseDurationMinutes(" 45 "), 45);
  });

  it("accepts fractional minutes", () => {
    assert.equal(parseDurationMinutes("7.5"), 7.5);
    assert.equal(parseDurationMinutes(0.5), 0.5);
  });

  it("rounds to the nearest second", () => {
    assert.equal(parseDurationMinutes(1.0001), 1);
    assert.equal(parseDurationMinutes(1 / 60), 1 / 60);
  });

  it("accepts up to a day", () => {
    assert.equal(parseDurationMinutes(MAX_DURATION_MINUTES), MAX_DURATION_MINUTES);
  });

  it("rejects zero, negatives, and anything under a second", () => {
    for (const value of [0, "0", -1, "-5", 0.001]) {
      assert.equal(parseDurationMinutes(value), null, String(value));
    }
  });

  it("rejects more than a day", () => {
    assert.equal(parseDurationMinutes(MAX_DURATION_MINUTES + 1), null);
  });

  it("rejects empty and non-numeric input", () => {
    for (const value of ["", "   ", null, undefined, "abc", "5 min", NaN, Infinity, {}, []]) {
      assert.equal(parseDurationMinutes(value), null, String(value));
    }
  });
});

describe("normalizeConfig", () => {
  it("returns defaults for missing or non-object input", () => {
    for (const raw of [null, undefined, 42, "x", true]) {
      assert.deepEqual(normalizeConfig(raw), defaultConfig(), String(raw));
    }
  });

  it("keeps a valid duration", () => {
    assert.deepEqual(normalizeConfig({ durationMinutes: 12 }), withDefaults({ durationMinutes: 12 }));
  });

  it("replaces an invalid duration with the default", () => {
    assert.deepEqual(normalizeConfig({ durationMinutes: -3 }), defaultConfig());
    assert.deepEqual(normalizeConfig({ durationMinutes: "soon" }), defaultConfig());
  });

  it("drops unknown keys", () => {
    assert.deepEqual(normalizeConfig({ durationMinutes: 3, extra: true }), withDefaults({ durationMinutes: 3 }));
  });

  it("normalizes styles, restoring missing built-ins", () => {
    const config = normalizeConfig({ styles: [{ id: "active", name: "Go", enabled: false }] });
    assert.deepEqual(config.styles.map((s) => s.id), ["active", "inactive", "starting-soon", "overtime"]);
    assert.equal(config.styles[0].name, "Go");
    assert.equal(config.styles[0].enabled, false);
  });
});

describe("loadConfig", () => {
  it("returns defaults when nothing is stored", () => {
    assert.deepEqual(loadConfig(memoryStorage()), defaultConfig());
  });

  it("reads a stored config", () => {
    const storage = memoryStorage({ [CONFIG_KEY]: JSON.stringify({ durationMinutes: 30 }) });
    assert.deepEqual(loadConfig(storage), withDefaults({ durationMinutes: 30 }));
  });

  it("returns defaults for corrupt JSON", () => {
    assert.deepEqual(loadConfig(memoryStorage({ [CONFIG_KEY]: "{not json" })), defaultConfig());
  });

  it("returns defaults when storage is missing or throws", () => {
    assert.deepEqual(loadConfig(null), defaultConfig());
    assert.deepEqual(loadConfig(throwingStorage), defaultConfig());
  });
});

describe("saveConfig / hasStoredConfig", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    assert.equal(hasStoredConfig(storage), false);
    assert.equal(saveConfig(storage, { durationMinutes: 7.5 }), true);
    assert.equal(hasStoredConfig(storage), true);
    assert.deepEqual(loadConfig(storage), withDefaults({ durationMinutes: 7.5 }));
  });

  it("stores a normalized config", () => {
    const storage = memoryStorage();
    saveConfig(storage, { durationMinutes: "abc", junk: 1 });
    assert.deepEqual(JSON.parse(storage.data.get(CONFIG_KEY)), defaultConfig());
  });

  it("returns false instead of throwing when storage fails", () => {
    assert.equal(saveConfig(throwingStorage, defaultConfig()), false);
    assert.equal(saveConfig(null, defaultConfig()), false);
    assert.equal(hasStoredConfig(throwingStorage), false);
    assert.equal(hasStoredConfig(null), false);
  });
});

describe("formatDurationMinutes", () => {
  it("formats whole and fractional minutes without trailing zeros", () => {
    assert.equal(formatDurationMinutes(5), "5");
    assert.equal(formatDurationMinutes(7.5), "7.5");
    assert.equal(formatDurationMinutes(1 / 60), "0.0167");
  });
});
