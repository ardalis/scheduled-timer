// Sounds played when the presentation starts and when its time ends. Pure
// logic, shared by app.js, the configuration UI, and the unit tests.

export const SOUNDS = {
  "trolleybus-bell": { label: "Trolleybus bell", file: "sounds/trolleybus-bell-conductors-5-quicksounds.com.mp3" },
  "alert-asterisk": { label: "Alert", file: "sounds/alert-asterisk-5-quicksounds.com.mp3" },
};

// "none" turns a sound off.
export const NO_SOUND = "none";

// A sound is skipped if its moment passed longer ago than this, e.g. while
// the tab was asleep or when reloading partway through.
export const LATE_SOUND_MS = 10 * 1000;

export function defaultSounds() {
  return { start: "trolleybus-bell", end: "alert-asterisk" };
}

/** Validates the sound choices, falling back to the defaults. */
export function normalizeSounds(raw) {
  const sounds = defaultSounds();
  if (!raw || typeof raw !== "object") return sounds;
  for (const key of Object.keys(sounds)) {
    if (raw[key] === NO_SOUND || Object.hasOwn(SOUNDS, raw[key])) sounds[key] = raw[key];
  }
  return sounds;
}

/** The file for a sound choice, or null for none. */
export function soundFile(id) {
  return Object.hasOwn(SOUNDS, id) ? SOUNDS[id].file : null;
}

/**
 * Whether a sound for a moment `msAgo` ago should play now: it has happened,
 * and recently enough that it still means something.
 */
export function isTimely(msAgo) {
  return msAgo >= 0 && msAgo <= LATE_SOUND_MS;
}
