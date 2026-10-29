import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultStyles, newCustomStyle } from "../../public/styles-core.js";
import {
  DEFAULT_THEME_ID,
  MAX_THEMES,
  allThemes,
  defaultTheme,
  deleteTheme,
  findTheme,
  isReservedThemeName,
  normalizeTheme,
  normalizeThemes,
  parseThemeJson,
  saveTheme,
  stylesMatch,
  themeFileName,
  themeToJson,
} from "../../public/themes-core.js";

const theme = (id, name, styles = defaultStyles()) => ({ id, name, styles });
const darkStyles = () => defaultStyles().map((s) => ({ ...s, background: "#000000" }));

describe("defaultTheme", () => {
  it("is the built-in styles", () => {
    assert.deepEqual(defaultTheme(), { id: DEFAULT_THEME_ID, name: "Default", builtIn: true, styles: defaultStyles() });
  });

  it("reserves its name, ignoring case", () => {
    assert.equal(isReservedThemeName("default"), true);
    assert.equal(isReservedThemeName("Default 2"), false);
  });
});

describe("normalizeTheme / normalizeThemes", () => {
  it("keeps valid themes and normalizes their styles", () => {
    const result = normalizeTheme({ id: "t1", name: " Big room ", styles: [{ id: "active", background: "#000000" }] });
    assert.equal(result.name, "Big room");
    assert.equal(result.styles.length, 4);
    assert.equal(result.styles.find((s) => s.id === "active").background, "#000000");
  });

  it("rejects themes without an id or a valid name, and the reserved Default", () => {
    for (const raw of [null, "x", {}, { id: "", name: "x" }, { id: "t", name: "" }, { id: "t", name: "x".repeat(41) },
      { id: DEFAULT_THEME_ID, name: "Mine" }, { id: "t", name: "DEFAULT" }]) {
      assert.equal(normalizeTheme(raw), null, JSON.stringify(raw));
    }
  });

  it("drops duplicate ids and names", () => {
    const themes = normalizeThemes([theme("a", "One"), theme("a", "Two"), theme("b", "one"), theme("c", "Three")]);
    assert.deepEqual(themes.map((t) => t.id), ["a", "c"]);
  });

  it("returns an empty list for invalid input and caps the count", () => {
    assert.deepEqual(normalizeThemes("nope"), []);
    const many = Array.from({ length: MAX_THEMES + 5 }, (_, i) => theme(`t${i}`, `Theme ${i}`));
    assert.equal(normalizeThemes(many).length, MAX_THEMES);
  });
});

describe("allThemes / findTheme", () => {
  it("lists Default first and finds by id", () => {
    const themes = [theme("a", "One")];
    assert.deepEqual(allThemes(themes).map((t) => t.id), [DEFAULT_THEME_ID, "a"]);
    assert.equal(findTheme(themes, "a").name, "One");
    assert.equal(findTheme(themes, DEFAULT_THEME_ID).name, "Default");
    assert.equal(findTheme(themes, "zzz"), null);
  });
});

describe("saveTheme", () => {
  it("adds a new theme with a copy of the styles", () => {
    const styles = darkStyles();
    const { themes, theme: saved } = saveTheme([], " Dark ", styles, "t1");
    assert.deepEqual(themes, [saved]);
    assert.equal(saved.id, "t1");
    assert.equal(saved.name, "Dark");
    styles[0].background = "#ffffff";
    assert.equal(saved.styles[0].background, "#000000");
  });

  it("replaces a theme with the same name, keeping its id", () => {
    const existing = [theme("t1", "Dark"), theme("t2", "Light")];
    const { themes, theme: saved } = saveTheme(existing, "dark", darkStyles(), "t3");
    assert.equal(saved.id, "t1");
    assert.deepEqual(themes.map((t) => t.id), ["t1", "t2"]);
    assert.equal(themes[0].styles[0].background, "#000000");
  });

  it("rejects invalid and reserved names, and too many themes", () => {
    assert.match(saveTheme([], "  ", [], "t").error, /Enter a theme name/);
    assert.match(saveTheme([], "Default", [], "t").error, /built in/);
    const full = Array.from({ length: MAX_THEMES }, (_, i) => theme(`t${i}`, `Theme ${i}`));
    assert.match(saveTheme(full, "One more", [], "t").error, /up to 50/);
    // Replacing one still works when full.
    assert.equal(saveTheme(full, "Theme 3", [], "t").theme.id, "t3");
  });
});

describe("deleteTheme / stylesMatch", () => {
  it("removes a theme by id", () => {
    assert.deepEqual(deleteTheme([theme("a", "A"), theme("b", "B")], "a").map((t) => t.id), ["b"]);
  });

  it("compares styles after normalizing", () => {
    assert.equal(stylesMatch(defaultStyles(), defaultStyles()), true);
    assert.equal(stylesMatch(defaultStyles(), []), true); // missing built-ins are restored
    assert.equal(stylesMatch(defaultStyles(), darkStyles()), false);
  });
});

describe("theme files", () => {
  it("round-trips through JSON", () => {
    const styles = [...darkStyles(), { ...newCustomStyle("wrap", 1), start: { expression: "$duration / 10" } }];
    const parsed = parseThemeJson(themeToJson("Dark", styles));
    assert.equal(parsed.name, "Dark");
    assert.deepEqual(parsed.styles.find((s) => s.id === "wrap").start, { expression: "$duration / 10" });
    assert.equal(parsed.styles[0].background, "#000000");
  });

  it("writes a versioned, readable file", () => {
    const json = JSON.parse(themeToJson("Dark", defaultStyles()));
    assert.equal(json.format, "scheduled-timer-theme");
    assert.equal(json.version, 1);
    assert.equal(json.styles.length, 4);
  });

  it("explains files it can't read", () => {
    assert.match(parseThemeJson("{nope").error, /valid JSON/);
    assert.match(parseThemeJson("[]").error, /isn't a Scheduled Timer theme/);
    assert.match(parseThemeJson('{"format":"other","styles":[]}').error, /isn't a Scheduled Timer theme/);
    assert.match(parseThemeJson('{"format":"scheduled-timer-theme","version":2,"name":"x","styles":[]}').error, /newer version/);
    assert.match(parseThemeJson('{"format":"scheduled-timer-theme","name":"x","styles":[]}').error, /isn't a Scheduled Timer theme/);
    assert.match(parseThemeJson("null").error, /isn't a Scheduled Timer theme/);
    assert.match(parseThemeJson('{"format":"scheduled-timer-theme","version":1,"name":"","styles":[]}').error, /no valid name/);
  });

  it("names files after the theme", () => {
    assert.equal(themeFileName("Big Room!"), "big-room.theme.json");
    assert.equal(themeFileName("***"), "theme.theme.json");
  });
});
