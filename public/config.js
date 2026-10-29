// User configuration, persisted as JSON in browser storage (localStorage).
// Storage is passed in so the logic can be unit tested without a browser.

import { DEFAULT_MINUTES } from "./timer-core.js";
import { defaultStyles, normalizeStyles } from "./styles-core.js";

export const CONFIG_KEY = "scheduled-timer:config";
// Up to a day; anything longer isn't a presentation timer.
export const MAX_DURATION_MINUTES = 24 * 60;

export function defaultConfig() {
  return { durationMinutes: DEFAULT_MINUTES, styles: defaultStyles() };
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
