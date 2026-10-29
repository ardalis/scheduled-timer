// Themes: named collections of styles that can be saved, switched between,
// and exported or imported as JSON. Pure logic, shared by app.js, the
// configuration UI, and the unit tests.
//
// The built-in Default theme is the default styles; it is never stored.
// Saved themes are kept in the config alongside the current styles.

import { defaultStyles, normalizeStyles, parseStyleName } from "./styles-core.js";

export const DEFAULT_THEME_ID = "default";
export const THEME_FILE_FORMAT = "scheduled-timer-theme";
export const THEME_FILE_VERSION = 1;
export const MAX_THEMES = 50;

export function defaultTheme() {
  return { id: DEFAULT_THEME_ID, name: "Default", builtIn: true, styles: defaultStyles() };
}

/** Validates a theme name (same rules as a style name). Returns the trimmed name or null. */
export const parseThemeName = parseStyleName;

const sameName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

/** Whether a name is taken by the built-in Default theme. */
export function isReservedThemeName(name) {
  return sameName(name, defaultTheme().name);
}

/** Validates one saved theme. Returns null if it's unusable. */
export function normalizeTheme(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
  if (raw.id === DEFAULT_THEME_ID) return null;
  const name = parseThemeName(raw.name);
  if (name === null || isReservedThemeName(name)) return null;
  return { id: raw.id, name, styles: normalizeStyles(raw.styles) };
}

/** Normalizes the stored list of saved themes: valid, with unique ids and names, at most MAX_THEMES. */
export function normalizeThemes(raw) {
  const result = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const theme = normalizeTheme(item);
    if (!theme || result.some((t) => t.id === theme.id || sameName(t.name, theme.name))) continue;
    result.push(theme);
    if (result.length === MAX_THEMES) break;
  }
  return result;
}

/** The Default theme followed by the saved themes. */
export function allThemes(themes) {
  return [defaultTheme(), ...themes];
}

export function findTheme(themes, id) {
  return allThemes(themes).find((theme) => theme.id === id) ?? null;
}

/**
 * Saves styles as a theme named `name`, replacing the styles of a saved theme
 * with the same name (ignoring case) or adding a new one with `newId`.
 * Returns { themes, theme } with a new list, or { error } if it can't be saved.
 */
export function saveTheme(themes, name, styles, newId) {
  const valid = parseThemeName(name);
  if (valid === null) return { error: "Enter a theme name (up to 40 characters)." };
  if (isReservedThemeName(valid)) return { error: `“${defaultTheme().name}” is built in; choose another name.` };
  const existing = themes.find((theme) => sameName(theme.name, valid));
  if (!existing && themes.length >= MAX_THEMES) return { error: `You can save up to ${MAX_THEMES} themes.` };
  const theme = { id: existing?.id ?? newId, name: valid, styles: normalizeStyles(structuredClone(styles)) };
  return {
    themes: existing ? themes.map((t) => (t.id === existing.id ? theme : t)) : [...themes, theme],
    theme,
  };
}

export function deleteTheme(themes, id) {
  return themes.filter((theme) => theme.id !== id);
}

/** Whether `styles` match a theme's styles exactly. */
export function stylesMatch(a, b) {
  return JSON.stringify(normalizeStyles(a)) === JSON.stringify(normalizeStyles(b));
}

/** A theme as the JSON text of an export file. */
export function themeToJson(name, styles) {
  return JSON.stringify(
    { format: THEME_FILE_FORMAT, version: THEME_FILE_VERSION, name, styles: normalizeStyles(styles) },
    null,
    2
  );
}

/** "Big Room" -> "big-room.theme.json" */
export function themeFileName(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "theme"}.theme.json`;
}

/**
 * Reads an exported theme file. Returns { name, styles } or { error }.
 * Unknown or invalid style properties fall back to defaults, as they do in storage.
 */
export function parseThemeJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "That file isn't valid JSON." };
  }
  const isTheme = raw && typeof raw === "object" && raw.format === THEME_FILE_FORMAT;
  if (!isTheme || !Array.isArray(raw.styles) || typeof raw.version !== "number") {
    return { error: "That file isn't a Scheduled Timer theme." };
  }
  if (raw.version > THEME_FILE_VERSION) {
    return { error: "That theme was made by a newer version of Scheduled Timer." };
  }
  const name = parseThemeName(raw.name);
  if (name === null) return { error: "That theme has no valid name." };
  return { name, styles: normalizeStyles(raw.styles) };
}
