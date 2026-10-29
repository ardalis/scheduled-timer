import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_IDS,
  FONTS,
  MAX_START_MINUTES,
  defaultStyles,
  describeStart,
  evaluateStartExpression,
  isHexColor,
  isStartExpression,
  newCustomStyle,
  normalizeStyle,
  normalizeStyles,
  parseStartExpression,
  parseStartMinutes,
  parseStyleName,
  resolveStyle,
  sortStylesForDisplay,
  startMinutes,
  styleToCss,
} from "../../public/styles-core.js";

const MINUTE = 60 * 1000;
const SECOND = 1000;
const DURATION = 5; // minutes

const custom = (id, minutes, extra = {}) => ({ ...newCustomStyle(id, minutes), name: id, ...extra });
const resolvedId = (styles, remainingMs, duration = DURATION) => resolveStyle(styles, remainingMs, duration).style?.id ?? null;

describe("defaultStyles", () => {
  const styles = defaultStyles();

  it("has the four built-in styles in order", () => {
    assert.deepEqual(styles.map((s) => s.id), BUILT_IN_IDS);
    assert.deepEqual(styles.map((s) => s.name), ["Inactive", "Starting Soon", "Active", "Overtime"]);
    assert.ok(styles.every((s) => s.builtIn && s.enabled));
  });

  it("starts Starting Soon at duration + 5, Active at the duration, and Overtime at -60", () => {
    assert.equal(startMinutes(styles[0], DURATION), null);
    assert.equal(startMinutes(styles[1], DURATION), 10);
    assert.equal(startMinutes(styles[2], DURATION), 5);
    assert.equal(startMinutes(styles[3], DURATION), -60);
    assert.equal(startMinutes(styles[1], 30), 35);
    assert.equal(startMinutes(styles[2], 30), 30);
    assert.equal(startMinutes(styles[3], 30), -60);
  });

  it("uses the specified looks", () => {
    const [inactive, soon, active, overtime] = styles;
    // Muted grey.
    assert.equal(inactive.background, "#2b2f36");
    // Blue with white handwritten text.
    assert.equal(soon.color, "#ffffff");
    assert.equal(soon.font, "handwritten");
    // Bright green with white bold sans serif.
    assert.equal(active.background, "#12b829");
    assert.equal(active.font, "sans");
    assert.equal(active.weight, 900);
    // Bright red with white Bangers.
    assert.equal(overtime.background, "#e5141b");
    assert.equal(overtime.font, "bangers");
  });

  it("returns fresh copies", () => {
    defaultStyles()[0].name = "Changed";
    assert.equal(defaultStyles()[0].name, "Inactive");
  });
});

describe("resolveStyle with the default styles", () => {
  const styles = defaultStyles();
  const cases = [
    ["idle", Infinity, "inactive"],
    ["far from the start", 2 * 60 * MINUTE, "inactive"],
    ["just over duration + 5", 10 * MINUTE + 1, "inactive"],
    ["exactly duration + 5", 10 * MINUTE, "starting-soon"],
    ["waiting, a minute before the start", 6 * MINUTE, "starting-soon"],
    ["just before the timer starts", 5 * MINUTE + 1, "starting-soon"],
    ["the moment the timer starts", 5 * MINUTE, "active"],
    ["counting down", 2 * MINUTE, "active"],
    ["the last millisecond", 1, "active"],
    ["zero", 0, "overtime"],
    ["over time", -5 * MINUTE, "overtime"],
    ["an hour over", -60 * MINUTE, "overtime"],
    ["past every style", -61 * MINUTE, "inactive"],
  ];
  for (const [label, remaining, expected] of cases) {
    it(`${label} -> ${expected}`, () => assert.equal(resolvedId(styles, remaining), expected));
  }

  it("reports the span each style covers", () => {
    assert.deepEqual(resolveStyle(styles, Infinity, DURATION), { style: styles[0], from: Infinity, to: 10 * MINUTE });
    assert.deepEqual(resolveStyle(styles, 7 * MINUTE, DURATION), { style: styles[1], from: 10 * MINUTE, to: 5 * MINUTE });
    assert.deepEqual(resolveStyle(styles, 3 * MINUTE, DURATION), { style: styles[2], from: 5 * MINUTE, to: 0 });
    assert.deepEqual(resolveStyle(styles, -3 * MINUTE, DURATION), { style: styles[3], from: 0, to: -60 * MINUTE });
    assert.deepEqual(resolveStyle(styles, -61 * MINUTE, DURATION), { style: styles[0], from: -60 * MINUTE, to: -Infinity });
  });

  it("moves relative starts with the duration", () => {
    assert.equal(resolvedId(styles, 25 * MINUTE, 30), "active");
    assert.equal(resolvedId(styles, 33 * MINUTE, 30), "starting-soon");
    assert.equal(resolvedId(styles, 36 * MINUTE, 30), "inactive");
  });
});

describe("resolveStyle precedence", () => {
  it("lets the start closest to zero win before zero", () => {
    const styles = [...defaultStyles(), custom("wrap-up", 1)];
    assert.equal(resolvedId(styles, 2 * MINUTE), "active");
    assert.equal(resolvedId(styles, MINUTE), "wrap-up");
    assert.equal(resolvedId(styles, SECOND), "wrap-up");
    assert.deepEqual(resolveStyle(styles, 30 * SECOND, DURATION).from, MINUTE);
    assert.deepEqual(resolveStyle(styles, 3 * MINUTE, DURATION).to, MINUTE);
  });

  it("lets the start closest to zero win over time", () => {
    const styles = [...defaultStyles(), custom("just-over", -2)];
    assert.equal(resolvedId(styles, -MINUTE), "just-over");
    assert.equal(resolvedId(styles, -2 * MINUTE), "just-over");
    assert.equal(resolvedId(styles, -2 * MINUTE - 1), "overtime");
    assert.deepEqual(resolveStyle(styles, -10 * MINUTE, DURATION), {
      style: defaultStyles()[3],
      from: -2 * MINUTE,
      to: -60 * MINUTE,
    });
  });

  it("skips disabled styles", () => {
    const styles = defaultStyles().map((s) => (s.id === "active" ? { ...s, enabled: false } : s));
    // Starting Soon now covers the whole countdown.
    assert.equal(resolvedId(styles, 2 * MINUTE), "starting-soon");
    assert.deepEqual(resolveStyle(styles, 2 * MINUTE, DURATION).to, 0);
  });

  it("falls back to Inactive where nothing else applies", () => {
    const styles = defaultStyles().map((s) => (s.id === "overtime" ? { ...s, enabled: false } : s));
    assert.equal(resolvedId(styles, -MINUTE), "inactive");
    assert.deepEqual(resolveStyle(styles, -MINUTE, DURATION), { style: styles[0], from: 0, to: -Infinity });
  });

  it("returns no style when nothing applies and Inactive is disabled", () => {
    const styles = defaultStyles().map((s) => ({ ...s, enabled: s.id !== "inactive" }));
    assert.equal(resolvedId(styles, Infinity), null);
    assert.equal(resolvedId(styles, 3 * MINUTE), "active");
    assert.equal(resolvedId([], 3 * MINUTE), null);
    assert.deepEqual(resolveStyle([], 3 * MINUTE, DURATION), { style: null, from: Infinity, to: 0 });
    assert.deepEqual(resolveStyle([], -3 * MINUTE, DURATION), { style: null, from: 0, to: -Infinity });
  });

  it("breaks ties by list order", () => {
    const styles = [custom("first", 2), custom("second", 2)];
    assert.equal(resolvedId(styles, MINUTE), "first");
  });

  it("treats a start of exactly zero as over time", () => {
    const styles = [custom("zero", 0)];
    assert.equal(resolvedId(styles, 0), "zero");
    assert.equal(resolvedId(styles, -SECOND), null);
    assert.equal(resolvedId(styles, SECOND), null);
  });

  it("can start a positive style past the duration, before a scheduled start", () => {
    const styles = [...defaultStyles(), custom("doors-open", 30)];
    assert.equal(resolvedId(styles, 20 * MINUTE), "doors-open");
    assert.equal(resolvedId(styles, 31 * MINUTE), "inactive");
  });
});

describe("normalizeStyle", () => {
  const base = defaultStyles()[2];

  it("keeps valid values", () => {
    const style = normalizeStyle(
      { name: " Go ", enabled: false, start: { minutes: 1.5, plusDuration: false }, background: "#ABCDEF", color: "#000000", font: "mono", weight: 400, sizePercent: 60, shadow: true },
      base
    );
    assert.deepEqual(style, {
      ...base,
      name: "Go",
      enabled: false,
      start: { minutes: 1.5, plusDuration: false },
      background: "#abcdef",
      color: "#000000",
      font: "mono",
      weight: 400,
      sizePercent: 60,
      shadow: true,
    });
  });

  it("replaces invalid values with the base's", () => {
    const style = normalizeStyle(
      { name: "", enabled: "yes", start: { minutes: "x" }, background: "red", color: "#12345", font: "comic", weight: 500, sizePercent: "big", shadow: 1 },
      base
    );
    assert.deepEqual(style, base);
  });

  it("clamps the size", () => {
    assert.equal(normalizeStyle({ sizePercent: 5 }, base).sizePercent, 40);
    assert.equal(normalizeStyle({ sizePercent: 500 }, base).sizePercent, 100);
    assert.equal(normalizeStyle({ sizePercent: 72.4 }, base).sizePercent, 72);
  });

  it("keeps the fallback style without a start", () => {
    const inactive = defaultStyles()[0];
    assert.equal(normalizeStyle({ start: { minutes: 3 } }, inactive).start, null);
  });

  it("never removes a start from a timed style", () => {
    assert.deepEqual(normalizeStyle({ start: null }, base).start, base.start);
    assert.deepEqual(normalizeStyle({ start: "soon" }, base).start, base.start);
  });

  it("rejects non-objects", () => {
    assert.equal(normalizeStyle(null, base), null);
    assert.equal(normalizeStyle("x", base), null);
    assert.equal(normalizeStyle({}, null), null);
  });
});

describe("normalizeStyles", () => {
  it("returns the defaults for missing or invalid input", () => {
    assert.deepEqual(normalizeStyles(undefined), defaultStyles());
    assert.deepEqual(normalizeStyles("nope"), defaultStyles());
    assert.deepEqual(normalizeStyles([]), defaultStyles());
  });

  it("keeps edits to built-ins and keeps them built in", () => {
    const styles = normalizeStyles([{ id: "overtime", name: "Over!", builtIn: false, background: "#000000" }]);
    const overtime = styles.find((s) => s.id === "overtime");
    assert.equal(overtime.name, "Over!");
    assert.equal(overtime.builtIn, true);
    assert.equal(overtime.background, "#000000");
  });

  it("keeps custom styles in their stored order", () => {
    const styles = normalizeStyles([...defaultStyles(), custom("b", 2), custom("a", 1)]);
    assert.deepEqual(styles.map((s) => s.id), [...BUILT_IN_IDS, "b", "a"]);
    assert.equal(styles[4].builtIn, false);
  });

  it("can't make a custom style built in", () => {
    const [style] = normalizeStyles([{ ...custom("sneaky", 2), builtIn: true }]);
    assert.equal(style.builtIn, false);
  });

  it("drops entries without an id, duplicates, and non-objects", () => {
    const styles = normalizeStyles([null, 5, { name: "no id" }, custom("x", 2), custom("x", 3), { id: 7 }]);
    assert.deepEqual(styles.map((s) => s.id), ["x", ...BUILT_IN_IDS]);
    assert.equal(startMinutes(styles[0], DURATION), 2);
  });
});

describe("parseStyleName / parseStartMinutes / isHexColor", () => {
  it("validates names", () => {
    assert.equal(parseStyleName("  Wrap it up "), "Wrap it up");
    assert.equal(parseStyleName("x".repeat(40)), "x".repeat(40));
    for (const value of ["", "   ", "x".repeat(41), null, 3]) assert.equal(parseStyleName(value), null, String(value));
  });

  it("validates starts", () => {
    assert.equal(parseStartMinutes("5"), 5);
    assert.equal(parseStartMinutes(-60), -60);
    assert.equal(parseStartMinutes("0"), 0);
    assert.equal(parseStartMinutes(1.0001), 1);
    assert.equal(parseStartMinutes(MAX_START_MINUTES), MAX_START_MINUTES);
    for (const value of ["", " ", null, undefined, "abc", NaN, Infinity, MAX_START_MINUTES + 1, -MAX_START_MINUTES - 1]) {
      assert.equal(parseStartMinutes(value), null, String(value));
    }
  });

  it("validates colors", () => {
    assert.equal(isHexColor("#a1B2c3"), true);
    for (const value of ["#abc", "a1b2c3", "#a1b2c3d4", "red", null]) assert.equal(isHexColor(value), false, String(value));
  });
});

describe("sortStylesForDisplay", () => {
  it("lists Inactive first, then largest to smallest start", () => {
    const styles = [...defaultStyles(), custom("wrap-up", 1), custom("way-over", -10), custom("doors", 20)];
    assert.deepEqual(sortStylesForDisplay(styles, DURATION).map((s) => s.id), [
      "inactive",
      "doors",
      "starting-soon",
      "active",
      "wrap-up",
      "way-over",
      "overtime",
    ]);
  });

  it("re-sorts when the duration moves relative starts", () => {
    const styles = [...defaultStyles(), custom("doors", 20)];
    assert.deepEqual(sortStylesForDisplay(styles, 30).map((s) => s.id), ["inactive", "starting-soon", "active", "doors", "overtime"]);
  });

  it("keeps list order for equal starts and does not mutate the input", () => {
    const styles = [custom("b", 2), custom("a", 2), defaultStyles()[0]];
    const copy = structuredClone(styles);
    assert.deepEqual(sortStylesForDisplay(styles, DURATION).map((s) => s.id), ["inactive", "b", "a"]);
    assert.deepEqual(styles, copy);
  });

  it("keeps list order between several fallback styles", () => {
    const [inactive] = defaultStyles();
    const styles = [custom("a", 2), { ...inactive, id: "x" }, inactive];
    assert.deepEqual(sortStylesForDisplay(styles, DURATION).map((s) => s.id), ["x", "inactive", "a"]);
  });
});

describe("describeStart", () => {
  const [inactive, soon, active, overtime] = defaultStyles();
  it("describes each kind of start", () => {
    assert.equal(describeStart(inactive, DURATION), "Otherwise");
    assert.equal(describeStart(soon, DURATION), "10 min (duration + 5)");
    assert.equal(describeStart(active, DURATION), "5 min (duration)");
    assert.equal(describeStart(overtime, DURATION), "-60 min");
    assert.equal(describeStart(custom("x", 1.5), DURATION), "1.5 min");
    assert.equal(describeStart({ ...active, start: { minutes: -2, plusDuration: true } }, 7.5), "5.5 min (duration − 2)");
  });
});

describe("styleToCss", () => {
  it("maps a style to custom properties", () => {
    const css = styleToCss(defaultStyles()[3]);
    assert.equal(css["--style-bg"], "#e5141b");
    assert.equal(css["--style-fg"], "#ffffff");
    assert.equal(css["--style-font"], FONTS.bangers.family);
    assert.equal(css["--style-weight"], "400");
    assert.equal(css["--style-scale"], "1");
    assert.notEqual(css["--style-shadow"], "none");
    assert.equal(styleToCss({ ...defaultStyles()[2], sizePercent: 50 })["--style-scale"], "0.5");
    assert.equal(styleToCss(defaultStyles()[2])["--style-shadow"], "none");
  });
});

describe("start expressions", () => {
  const expr = (id, expression, extra = {}) => ({ ...custom(id, 1), start: { expression }, ...extra });

  it("recognizes text that mentions the duration", () => {
    assert.equal(isStartExpression("$duration / 10"), true);
    assert.equal(isStartExpression("Duration-1"), true);
    assert.equal(isStartExpression("5"), false);
    assert.equal(isStartExpression(null), false);
  });

  it("parses and tidies valid expressions", () => {
    assert.equal(parseStartExpression("  $duration   /  10 "), "$duration / 10");
    for (const value of ["$duration", "duration-5", "($duration - 5) * 2", "-$duration / 4", "$duration*.5", "+$duration"]) {
      assert.equal(typeof parseStartExpression(value), "string", value);
    }
  });

  it("rejects invalid expressions", () => {
    const invalid = ["", "5", "$duration +", "$duration $duration", "($duration", "$duration)", "$durationx", "$time", "alert(1)",
      "$duration ** 2", "$duration % 2", `$duration + ${"1".repeat(60)}`, null, 3];
    for (const value of invalid) assert.equal(parseStartExpression(value), null, String(value));
  });

  it("evaluates with operator precedence, rounded to the second", () => {
    assert.equal(evaluateStartExpression("$duration / 10", 30), 3);
    assert.equal(evaluateStartExpression("$duration - 5", 30), 25);
    assert.equal(evaluateStartExpression("$duration - 2 * 3", 30), 24);
    assert.equal(evaluateStartExpression("($duration - 2) * 3", 30), 84);
    assert.equal(evaluateStartExpression("-$duration / 4", 20), -5);
    assert.equal(evaluateStartExpression("$duration / 7", 1), Math.round((60 / 7)) / 60);
    assert.ok(Number.isNaN(evaluateStartExpression("$duration / ($duration - 5)", 5)));
    assert.ok(Number.isNaN(evaluateStartExpression("nonsense", 5)));
  });

  it("keeps a valid expression when normalizing, and falls back otherwise", () => {
    const base = newCustomStyle("x", 2);
    assert.deepEqual(normalizeStyle({ start: { expression: " $duration/2 " } }, base).start, { expression: "$duration/2" });
    assert.deepEqual(normalizeStyle({ start: { expression: "5" } }, base).start, base.start);
    assert.deepEqual(normalizeStyle({ start: { expression: 5 } }, base).start, base.start);
  });

  it("starts styles relative to the duration", () => {
    const styles = [...defaultStyles(), expr("wrap-up", "$duration / 10")];
    // A 30 minute talk wraps up 3 minutes from the end; a 10 minute talk, 1 minute.
    assert.equal(resolvedId(styles, 3 * MINUTE, 30), "wrap-up");
    assert.equal(resolvedId(styles, 3 * MINUTE + SECOND, 30), "active");
    assert.equal(resolvedId(styles, 1 * MINUTE, 10), "wrap-up");
    assert.equal(resolvedId(styles, 2 * MINUTE, 10), "active");
  });

  it("ignores a style whose expression has no value", () => {
    const styles = [...defaultStyles(), expr("broken", "$duration / ($duration - 5)")];
    assert.equal(resolvedId(styles, 2 * MINUTE, 5), "active");
    assert.deepEqual(sortStylesForDisplay(styles, 5).map((s) => s.id).at(-1), "broken");
  });

  it("describes an expression start", () => {
    assert.equal(describeStart(expr("x", "$duration / 10"), 30), "3 min ($duration / 10)");
    assert.equal(describeStart(expr("x", "$duration / ($duration - 5)"), 5), "Undefined ($duration / ($duration - 5))");
  });
});
