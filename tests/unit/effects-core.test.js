import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EFFECT_TYPES,
  MAX_EFFECT_SECONDS,
  defaultEffects,
  describeEffect,
  effectState,
  fadeStyle,
  mixColors,
  newEffect,
  normalizeEffect,
  normalizeEffects,
  parseEffectSeconds,
} from "../../public/effects-core.js";
import { defaultStyles, normalizeStyle, normalizeStyles, newCustomStyle } from "../../public/styles-core.js";

const SECOND = 1000;
const strobe = (extra = {}) => ({ ...newEffect("s", "strobe"), ...extra });
const fade = (extra = {}) => ({ ...newEffect("f", "fade"), ...extra });

describe("default effects", () => {
  it("strobes for 5 seconds when Overtime begins, and nothing else", () => {
    assert.deepEqual(defaultEffects("overtime"), [
      { id: "strobe", type: "strobe", enabled: true, startSeconds: 0, durationSeconds: 5 },
    ]);
    assert.deepEqual(defaultEffects("active"), []);
  });

  it("are part of the built-in styles", () => {
    const styles = defaultStyles();
    assert.deepEqual(styles.find((s) => s.id === "overtime").effects, defaultEffects("overtime"));
    assert.deepEqual(styles.find((s) => s.id === "inactive").effects, []);
    assert.deepEqual(newCustomStyle("x").effects, []);
  });
});

describe("parseEffectSeconds", () => {
  it("accepts whole seconds from 0 to a day", () => {
    assert.equal(parseEffectSeconds("5"), 5);
    assert.equal(parseEffectSeconds(0), 0);
    assert.equal(parseEffectSeconds(2.6), 3);
    assert.equal(parseEffectSeconds(MAX_EFFECT_SECONDS), MAX_EFFECT_SECONDS);
    for (const value of ["", " ", null, undefined, "x", -1, MAX_EFFECT_SECONDS + 1, Infinity]) {
      assert.equal(parseEffectSeconds(value), null, String(value));
    }
  });
});

describe("normalizeEffect / normalizeEffects", () => {
  it("keeps valid effects", () => {
    assert.deepEqual(normalizeEffect({ id: "a", type: "strobe", enabled: false, startSeconds: 3, durationSeconds: 0 }), {
      id: "a", type: "strobe", enabled: false, startSeconds: 3, durationSeconds: 0,
    });
  });

  it("fills in invalid values, and fades never have a duration", () => {
    assert.deepEqual(normalizeEffect({ id: "a", type: "strobe", enabled: "y", startSeconds: -1, durationSeconds: "x" }), newEffect("a", "strobe"));
    assert.equal(normalizeEffect({ id: "b", type: "fade", durationSeconds: 9 }).durationSeconds, 0);
  });

  it("rejects effects without an id or a known type", () => {
    for (const raw of [null, "x", {}, { id: "", type: "strobe" }, { id: "a", type: "explode" }, { id: "a", type: "toString" }]) {
      assert.equal(normalizeEffect(raw), null, JSON.stringify(raw));
    }
  });

  it("uses the fallback without a list, and drops duplicates", () => {
    assert.deepEqual(normalizeEffects(undefined, defaultEffects("overtime")), defaultEffects("overtime"));
    assert.deepEqual(normalizeEffects([], defaultEffects("overtime")), []);
    assert.deepEqual(normalizeEffects([strobe(), strobe({ startSeconds: 9 }), null]).map((e) => e.startSeconds), [0]);
  });

  it("are normalized with styles; the fallback style never has effects", () => {
    const [inactive, , , overtime] = defaultStyles();
    assert.deepEqual(normalizeStyle({ effects: [strobe()] }, inactive).effects, []);
    assert.deepEqual(normalizeStyle({}, overtime).effects, defaultEffects("overtime"));
    assert.deepEqual(normalizeStyle({ effects: [] }, overtime).effects, []);
    // Configs from before effects get the default strobe.
    const styles = normalizeStyles([{ id: "overtime", name: "Over" }]);
    assert.deepEqual(styles.find((s) => s.id === "overtime").effects, defaultEffects("overtime"));
  });
});

describe("describeEffect", () => {
  it("summarizes timing", () => {
    assert.equal(describeEffect(strobe()), "Strobe for 5 s");
    assert.equal(describeEffect(strobe({ durationSeconds: 0, startSeconds: 10 })), "Strobe until the style ends after 10 s");
    assert.equal(describeEffect(fade()), "Fade to next style");
    assert.equal(describeEffect(fade({ startSeconds: 30 })), "Fade to next style after 30 s");
    assert.deepEqual(Object.keys(EFFECT_TYPES), ["strobe", "fade"]);
  });
});

describe("effectState", () => {
  it("strobes from its start for its duration", () => {
    const effects = [strobe({ startSeconds: 2, durationSeconds: 5 })];
    assert.equal(effectState(effects, 1.9 * SECOND, Infinity).strobe, false);
    assert.equal(effectState(effects, 2 * SECOND, Infinity).strobe, true);
    assert.equal(effectState(effects, 6.9 * SECOND, Infinity).strobe, true);
    assert.equal(effectState(effects, 7 * SECOND, Infinity).strobe, false);
  });

  it("strobes until the style ends with a duration of 0", () => {
    const effects = [strobe({ durationSeconds: 0 })];
    assert.equal(effectState(effects, 59 * SECOND, 60 * SECOND).strobe, true);
    assert.equal(effectState(effects, 10 * 60 * SECOND, Infinity).strobe, true);
  });

  it("fades from its start to the end of the style", () => {
    const effects = [fade({ startSeconds: 20 })];
    assert.equal(effectState(effects, 10 * SECOND, 60 * SECOND).fade, null);
    assert.equal(effectState(effects, 20 * SECOND, 60 * SECOND).fade, 0);
    assert.equal(effectState(effects, 40 * SECOND, 60 * SECOND).fade, 0.5);
    assert.equal(effectState(effects, 60 * SECOND, 60 * SECOND).fade, 1);
  });

  it("can't fade a style with no end, or start a fade after it ends", () => {
    assert.equal(effectState([fade()], 5 * SECOND, Infinity).fade, null);
    assert.equal(effectState([fade({ startSeconds: 90 })], 95 * SECOND, 60 * SECOND).fade, null);
  });

  it("ignores disabled effects and times outside the style", () => {
    assert.deepEqual(effectState([strobe({ enabled: false })], 0, Infinity), { strobe: false, fade: null });
    assert.deepEqual(effectState([strobe()], -1, Infinity), { strobe: false, fade: null });
    assert.deepEqual(effectState([strobe()], NaN, Infinity), { strobe: false, fade: null });
    assert.deepEqual(effectState(undefined, 0, Infinity), { strobe: false, fade: null });
  });
});

describe("mixColors / fadeStyle", () => {
  it("blends colors", () => {
    assert.equal(mixColors("#000000", "#ffffff", 0), "#000000");
    assert.equal(mixColors("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mixColors("#12b829", "#e5141b", 1), "#e5141b");
  });

  it("blends colors and size toward the next style", () => {
    const [, , active, overtime] = defaultStyles();
    const halfway = fadeStyle({ ...active, sizePercent: 60 }, overtime, 0.5);
    assert.equal(halfway.background, mixColors(active.background, overtime.background, 0.5));
    assert.equal(halfway.color, "#ffffff");
    assert.equal(halfway.sizePercent, 80);
    assert.equal(halfway.font, active.font);
    assert.equal(fadeStyle(active, overtime, 0), active);
    assert.equal(fadeStyle(active, null, 0.5), active);
  });
});
