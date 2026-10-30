// Scheduled talks: pure logic with no DOM access, shared by app.js and the unit tests.
// A talk is { name, start (epoch ms), durationMinutes }. A null duration follows
// the presentation duration in configuration.

import { isStopped, MAX_SCHEDULE_AHEAD_MS, restoreSchedule } from "./timer-core.js";
import { parseDurationMinutes } from "./config.js";

export const TALKS_KEY = "scheduled-timer:talks";
export const MAX_TALK_NAME_LENGTH = 60;

/** A talk's length in ms; `defaultMs` for no talk, or one with no duration of its own. */
export function talkDurationMs(talk, defaultMs) {
  const minutes = talk?.durationMinutes ?? null;
  return minutes === null ? defaultMs : Math.round(minutes * 60 * 1000);
}

/** What to call a talk in the UI. */
export function talkLabel(talk) {
  return talk.name || "Untitled talk";
}

export function sortTalks(talks) {
  return [...talks].sort((a, b) => a.start - b.start);
}

/** Drops invalid entries from a stored talk list, and sorts it. */
export function normalizeTalks(raw) {
  if (!Array.isArray(raw)) return [];
  const talks = raw
    .filter((talk) => talk && Number.isFinite(talk.start) && talk.start > 0)
    .map((talk) => ({
      name: typeof talk.name === "string" ? talk.name.trim().slice(0, MAX_TALK_NAME_LENGTH) : "",
      start: talk.start,
      durationMinutes: parseDurationMinutes(talk.durationMinutes),
    }));
  return sortTalks(talks);
}

/** Reads the talks from storage, falling back to none if missing or corrupt. */
export function loadTalks(storage) {
  try {
    const json = storage?.getItem(TALKS_KEY);
    return normalizeTalks(json ? JSON.parse(json) : null);
  } catch {
    return [];
  }
}

/** Saves the talks. Returns false if storage is unavailable. */
export function saveTalks(storage, talks) {
  try {
    storage.setItem(TALKS_KEY, JSON.stringify(talks));
    return true;
  } catch {
    return false;
  }
}

/**
 * The first two talks whose planned times overlap, as [earlier, later], or null.
 * One talk may start the moment another ends, and overtime doesn't count.
 */
export function findOverlap(talks, defaultMs) {
  const sorted = sortTalks(talks);
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    if (previous.start + talkDurationMs(previous, defaultMs) > sorted[i].start) return [previous, sorted[i]];
  }
  return null;
}

/** The first of `talks` whose planned time overlaps `talk`, or null. */
export function findConflict(talk, talks, defaultMs) {
  const end = talk.start + talkDurationMs(talk, defaultMs);
  return talks.find((other) => other.start < end && talk.start < other.start + talkDurationMs(other, defaultMs)) ?? null;
}

/** The latest talk in a sorted list that has reached its start, or null. */
export function lastStarted(talks, now) {
  return talks.findLast((talk) => talk.start <= now) ?? null;
}

/**
 * The talks to keep on page load: the stored ones plus a schedule found only
 * in the cookie (saved by an older version, or with storage blocked), without
 * those that have stopped or are further ahead than a schedule can be.
 */
export function restoreTalks(stored, savedStart, defaultMs, now) {
  const known = stored.some((talk) => String(talk.start) === savedStart);
  const fromCookie = !known && restoreSchedule(savedStart, defaultMs, now).mode !== "none";
  const talks = fromCookie ? [...stored, { name: "", start: Number(savedStart), durationMinutes: null }] : stored;
  return sortTalks(talks).filter(
    (talk) =>
      talk.start - now <= MAX_SCHEDULE_AHEAD_MS && !isStopped(talk.start + talkDurationMs(talk, defaultMs) - now)
  );
}
