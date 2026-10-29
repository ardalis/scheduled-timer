// Effects: changes to the look of the countdown at points within a style.
// Pure logic, shared by app.js, the style editor, and the unit tests.
//
// Each timed style has a list of effects. An effect starts `startSeconds`
// after its style begins and lasts `durationSeconds` (0: until the style
// ends).
//   strobe  inverts the screen colors every half second (a CSS animation,
//           see styles.css)
//   fade    blends the colors and size toward the next style, reaching it
//           as the style ends (it always runs to the end of the style)

// No effect timing can be longer than a day.
export const MAX_EFFECT_SECONDS = 24 * 60 * 60;

export const EFFECT_TYPES = {
  strobe: { label: "Strobe", hasDuration: true, defaults: { startSeconds: 0, durationSeconds: 5 } },
  fade: { label: "Fade to next style", hasDuration: false, defaults: { startSeconds: 0, durationSeconds: 0 } },
};

/** A new effect of `type` with its default timing. */
export function newEffect(id, type) {
  return { id, type, enabled: true, ...EFFECT_TYPES[type].defaults };
}

/** The effects a built-in style starts with. */
export function defaultEffects(styleId) {
  // Catch the speaker's eye when time runs out.
  return styleId === "overtime" ? [newEffect("strobe", "strobe")] : [];
}

/** Validates a number of seconds (whole seconds, 0 to a day). Returns it, or null. */
export function parseEffectSeconds(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_EFFECT_SECONDS) return null;
  return Math.round(seconds);
}

/** Validates one effect. Returns null if it's unusable. */
export function normalizeEffect(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
  if (!Object.hasOwn(EFFECT_TYPES, raw.type)) return null;
  const effect = newEffect(raw.id, raw.type);
  if (typeof raw.enabled === "boolean") effect.enabled = raw.enabled;
  effect.startSeconds = parseEffectSeconds(raw.startSeconds) ?? effect.startSeconds;
  if (EFFECT_TYPES[raw.type].hasDuration) effect.durationSeconds = parseEffectSeconds(raw.durationSeconds) ?? effect.durationSeconds;
  return effect;
}

/** Validates a style's effects; `fallback` is used when there is no list at all. */
export function normalizeEffects(raw, fallback = []) {
  if (!Array.isArray(raw)) return structuredClone(fallback);
  const result = [];
  for (const item of raw) {
    const effect = normalizeEffect(item);
    if (effect && !result.some((e) => e.id === effect.id)) result.push(effect);
  }
  return result;
}

/** "Strobe for 5 s", "Fade to next style after 30 s", "Strobe until the style ends". */
export function describeEffect(effect) {
  const { label, hasDuration } = EFFECT_TYPES[effect.type];
  const after = effect.startSeconds ? ` after ${effect.startSeconds} s` : "";
  if (!hasDuration) return `${label}${after}`;
  const length = effect.durationSeconds ? ` for ${effect.durationSeconds} s` : " until the style ends";
  return `${label}${length}${after}`;
}

/**
 * Which effects are showing `elapsedMs` into a style that lasts `spanMs`
 * (Infinity if it has no end). Returns { strobe, fade }: whether to strobe,
 * and how far to fade toward the next style (0 to 1), or null for no fade.
 */
export function effectState(effects, elapsedMs, spanMs) {
  const state = { strobe: false, fade: null };
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return state;
  for (const effect of effects ?? []) {
    if (!effect.enabled) continue;
    const start = effect.startSeconds * 1000;
    if (elapsedMs < start) continue;
    if (effect.type === "strobe") {
      const end = effect.durationSeconds ? start + effect.durationSeconds * 1000 : spanMs;
      if (elapsedMs < end) state.strobe = true;
    } else if (effect.type === "fade" && Number.isFinite(spanMs) && start < spanMs) {
      const progress = Math.min(1, (elapsedMs - start) / (spanMs - start));
      state.fade = Math.max(state.fade ?? 0, progress);
    }
  }
  return state;
}

function mixChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** Blends two "#rrggbb" colors; t = 0 gives a, 1 gives b. */
export function mixColors(a, b, t) {
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return `#${[mixChannel(ar, br, t), mixChannel(ag, bg, t), mixChannel(ab, bb, t)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** A style partway (t) through fading into `next`: colors and size blend; font and shadow stay. */
export function fadeStyle(style, next, t) {
  if (!next || t <= 0) return style;
  return {
    ...style,
    background: mixColors(style.background, next.background, t),
    color: mixColors(style.color, next.color, t),
    sizePercent: style.sizePercent + (next.sizePercent - style.sizePercent) * t,
  };
}
