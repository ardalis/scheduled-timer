// User configuration, persisted as JSON in browser storage (localStorage).
// Storage is passed in so the logic can be unit tested without a browser.

import { DEFAULT_MINUTES } from "./timer-core.js";
import { defaultStyles, normalizeStyles } from "./styles-core.js";
import { DEFAULT_THEME_ID, normalizeThemes } from "./themes-core.js";

export const CONFIG_KEY = "scheduled-timer:config";
// Up to a day; anything longer isn't a presentation timer.
export const MAX_DURATION_MINUTES = 24 * 60;

export function defaultConfig() {
  // themeId: the theme last chosen or saved (null if none); the styles are a
  // working copy that may have changed since.
  // keyboardControl: whether Space starts and pauses the timer. Off by default so
  // a presentation remote sending keys to this window can't change the timer.
  return {
    durationMinutes: DEFAULT_MINUTES,
    styles: defaultStyles(),
    themes: [],
    themeId: DEFAULT_THEME_ID,
    keyboardControl: false,
  };
}

/**
 * Validates a timer duration in minutes. Any positive number is allowed
 * (fractions too, rounded to the nearest second) up to MAX_DURATION_MINUTES.
 * Returns the normalized number of minutes, or null if invalid.
 */
export function parseDurationMinutes(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return null;
  const seconds = Math.round(minutes * 60);
  if (seconds < 1 || minutes > MAX_DURATION_MINUTES) return null;
  return seconds / 60;
}

/** Fills in defaults and drops invalid values from a stored config object. */
export function normalizeConfig(raw) {
  const config = defaultConfig();
  if (raw && typeof raw === "object") {
    const duration = parseDurationMinutes(raw.durationMinutes);
    if (duration !== null) config.durationMinutes = duration;
    config.styles = normalizeStyles(raw.styles);
    config.themes = normalizeThemes(raw.themes);
    const known = raw.themeId === DEFAULT_THEME_ID || config.themes.some((theme) => theme.id === raw.themeId);
    // Configs from before themes have no themeId; their styles started as Default.
    config.themeId = raw.themeId === undefined || known ? raw.themeId ?? DEFAULT_THEME_ID : null;
    config.keyboardControl = raw.keyboardControl === true;
  }
  return config;
}

/** Reads the config from storage, falling back to defaults if missing or corrupt. */
export function loadConfig(storage) {
  let raw = null;
  try {
    const json = storage?.getItem(CONFIG_KEY);
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  return normalizeConfig(raw);
}

/** Whether a config has been saved before. */
export function hasStoredConfig(storage) {
  try {
    return storage?.getItem(CONFIG_KEY) != null;
  } catch {
    return false;
  }
}

/** Saves the config. Returns false if storage is unavailable (e.g. private mode quota). */
export function saveConfig(storage, config) {
  try {
    storage.setItem(CONFIG_KEY, JSON.stringify(normalizeConfig(config)));
    return true;
  } catch {
    return false;
  }
}

/** "5", "1.5", "0.0167": a duration formatted for the minutes input. */
export function formatDurationMinutes(minutes) {
  return String(Number(minutes.toFixed(4)));
}
