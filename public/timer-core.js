// Pure timer logic with no DOM access, shared by app.js and the unit tests.

export const DEFAULT_MINUTES = 5;
export const DAY_MS = 24 * 60 * 60 * 1000;
// The next occurrence of a time is at most 24 hours away, except across a
// daylight saving "fall back" day, which has an extra hour.
export const MAX_SCHEDULE_AHEAD_MS = DAY_MS + 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Next local Date at hh:mm that is after `now` (within 24 hours, or 25 across a "fall back" day).
 * On a daylight saving "fall back" night a repeated time resolves to its
 * second occurrence if the first has passed; a skipped time rolls forward.
 */
export function nextOccurrence(hours, minutes, now = new Date()) {
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (target > now) return target;

  const repeated = new Date(target.getTime() + 60 * 60 * 1000);
  if (repeated > now && repeated.getHours() === hours && repeated.getMinutes() === minutes) {
    return repeated;
  }
  target.setDate(target.getDate() + 1);
  target.setHours(hours, minutes, 0, 0);
  return target;
}

/** mm:ss under an hour, hh:mm:ss from an hour up. */
export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** Natural-language span, e.g. "2 hours and 5 minutes" or "45 seconds". */
export function formatTimespan(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const unit = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  const parts = [];
  if (hours) parts.push(unit(hours, "hour"));
  if (minutes) parts.push(unit(minutes, "minute"));
  // Seconds only matter once we're within the last hour.
  if (!hours && seconds) parts.push(unit(seconds, "second"));
  if (!parts.length) return "less than a second";
  return parts.length === 1 ? parts[0] : `${parts[0]} and ${parts[1]}`;
}

/** Parses an `<input type="time">` value ("HH:MM" or "HH:MM:SS"). Returns null if invalid. */
export function parseTimeInput(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** "HH:MM" for an `<input type="time">` value. */
export function toTimeInputValue(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Suggested start time for an empty form: the top of the next hour. */
export function defaultStartTimeValue(now = new Date()) {
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  return `${pad2(next.getHours())}:00`;
}

/** Reads one cookie value from a `document.cookie` style string. */
export function parseCookie(cookieString, name) {
  const match = (cookieString ?? "")
    .split(/;\s*/)
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}

/**
 * Cookie lifetime in seconds for a scheduled start: until a minute past the
 * end of the timer, so reloading mid-talk can resume.
 */
export function scheduleCookieMaxAge(startMs, durationMs, now) {
  const seconds = Math.ceil((startMs - now + durationMs) / 1000) + 60;
  return Math.max(60, seconds);
}

/**
 * Decides what a saved scheduled start means on page load.
 *  - { mode: "waiting", start }   start is in the future (no further than a schedule can be)
 *  - { mode: "running", endTime } start has passed but the timer would still be running
 *  - { mode: "none", stale }      nothing usable; `stale` means the cookie should be deleted
 */
export function restoreSchedule(savedValue, durationMs, now) {
  if (savedValue == null || savedValue === "") return { mode: "none", stale: false };
  const start = Number(savedValue);
  if (!Number.isFinite(start) || start <= 0) return { mode: "none", stale: true };
  if (start > now) {
    return start - now <= MAX_SCHEDULE_AHEAD_MS
      ? { mode: "waiting", start }
      : { mode: "none", stale: true };
  }
  const endTime = start + durationMs;
  return endTime > now ? { mode: "running", endTime } : { mode: "none", stale: true };
}
