// Styles: how the screen looks at each point of the countdown. Pure logic,
// shared by app.js, the configuration UI, and the unit tests.
//
// Each style has a start, measured as a distance from zero in minutes:
// positive before zero (counting down), negative after (over time). A style
// applies from its start until the next style closer to zero takes over, so
// the closest start on either side of zero wins. Before a scheduled timer
// begins, the distance is the duration plus the time until it starts, so a
// style that starts at "duration + 5" turns on 5 minutes before the start.
//
// The Inactive style has no start; it applies whenever no other style does
// (idle, a start far away, or past every negative style).
//
// A start is either { minutes, plusDuration } or { expression }, an
// arithmetic expression of the presentation duration such as
// "$duration / 10" (see parseStartExpression).

import { defaultEffects, normalizeEffects } from "./effects-core.js";

const MINUTE = 60 * 1000;

export const FONTS = {
  sans: { label: "Sans serif", family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  handwritten: { label: "Handwritten (Caveat)", family: '"Caveat", "Segoe Print", "Bradley Hand", cursive' },
  bangers: { label: "Comic (Bangers)", family: '"Bangers", Impact, "Arial Black", fantasy' },
  serif: { label: "Serif", family: 'Georgia, "Times New Roman", serif' },
  mono: { label: "Monospace", family: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace' },
};

export const WEIGHTS = { 400: "Regular", 700: "Bold", 900: "Black" };

export const MIN_SIZE_PERCENT = 40;
export const MAX_SIZE_PERCENT = 100;
export const MAX_NAME_LENGTH = 40;
// No style can start further than a day from zero.
export const MAX_START_MINUTES = 24 * 60;

export const BUILT_IN_IDS = ["inactive", "starting-soon", "active", "overtime"];

/** The predefined styles, in their default order. */
export function defaultStyles() {
  return builtInStyles().map((style) => ({ ...style, effects: defaultEffects(style.id) }));
}

function builtInStyles() {
  return [
    {
      id: "inactive",
      name: "Inactive",
      builtIn: true,
      enabled: true,
      start: null,
      background: "#2b2f36",
      color: "#9aa3ad",
      font: "sans",
      weight: 700,
      sizePercent: 100,
      shadow: false,
    },
    {
      id: "starting-soon",
      name: "Starting Soon",
      builtIn: true,
      enabled: true,
      start: { minutes: 5, plusDuration: true },
      background: "#3a7bd5",
      color: "#ffffff",
      font: "handwritten",
      weight: 700,
      sizePercent: 100,
      shadow: false,
    },
    {
      id: "active",
      name: "Active",
      builtIn: true,
      enabled: true,
      start: { minutes: 0, plusDuration: true },
      background: "#12b829",
      color: "#ffffff",
      font: "sans",
      weight: 900,
      sizePercent: 100,
      shadow: false,
    },
    {
      id: "overtime",
      name: "Overtime",
      builtIn: true,
      enabled: true,
      start: { minutes: -60, plusDuration: false },
      background: "#e5141b",
      color: "#ffffff",
      font: "bangers",
      weight: 400,
      sizePercent: 100,
      shadow: true,
    },
  ];
}

/** A new custom style, starting at `minutes` from zero. */
export function newCustomStyle(id, minutes = 1) {
  return {
    id,
    name: "New style",
    builtIn: false,
    enabled: true,
    start: { minutes, plusDuration: false },
    background: "#f5a623",
    color: "#1a1a1a",
    font: "sans",
    weight: 900,
    sizePercent: 100,
    shadow: false,
    effects: [],
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value) {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** Validates a style name. Returns the trimmed name, or null if empty or too long. */
export function parseStyleName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** Validates a start offset in minutes (any finite number within a day, to the second). */
export function parseStartMinutes(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || Math.abs(minutes) > MAX_START_MINUTES) return null;
  return Math.round(minutes * 60) / 60;
}

// ---- Start expressions -----------------------------------------------------
// Numbers, $duration (the presentation duration in minutes), + - * /, and
// parentheses. "duration" without the $ is accepted too.

export const MAX_EXPRESSION_LENGTH = 60;
const DURATION_VARIABLE = /\$?duration\b/i;
const TOKEN = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|(\$?duration)\b|([-+*/()]))/iy;

/** Whether text is meant as an expression (it mentions the duration) rather than plain minutes. */
export function isStartExpression(value) {
  return typeof value === "string" && DURATION_VARIABLE.test(value);
}

function tokenize(value) {
  const text = value.trim();
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const match = TOKEN.exec(text);
    if (!match) return null;
    if (match[1] !== undefined) tokens.push({ number: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ duration: true });
    else tokens.push({ op: match[3] });
  }
  return tokens;
}

/**
 * Compiles an expression into a function of the duration (minutes), or
 * returns null if it isn't valid. A recursive descent parser, so nothing is
 * ever passed to eval.
 */
function compile(text) {
  const tokens = tokenize(text);
  if (!tokens || !tokens.length) return null;
  let i = 0;
  const peek = () => tokens[i]?.op;

  function expression() {
    let left = term();
    while (left && (peek() === "+" || peek() === "-")) {
      const op = tokens[i++].op;
      const right = term();
      if (!right) return null;
      const l = left;
      left = op === "+" ? (d) => l(d) + right(d) : (d) => l(d) - right(d);
    }
    return left;
  }

  function term() {
    let left = factor();
    while (left && (peek() === "*" || peek() === "/")) {
      const op = tokens[i++].op;
      const right = factor();
      if (!right) return null;
      const l = left;
      left = op === "*" ? (d) => l(d) * right(d) : (d) => l(d) / right(d);
    }
    return left;
  }

  function factor() {
    const token = tokens[i++];
    if (!token) return null;
    if (token.number !== undefined) return () => token.number;
    if (token.duration) return (d) => d;
    if (token.op === "-" || token.op === "+") {
      const inner = factor();
      if (!inner) return null;
      return token.op === "-" ? (d) => -inner(d) : inner;
    }
    if (token.op === "(") {
      const inner = expression();
      if (!inner || tokens[i++]?.op !== ")") return null;
      return inner;
    }
    return null;
  }

  const result = expression();
  return result && i === tokens.length ? result : null;
}

const compiled = new Map();

function compiledExpression(text) {
  if (!compiled.has(text)) compiled.set(text, compile(text));
  return compiled.get(text);
}

/**
 * Validates a start expression. Returns it with whitespace tidied, or null if
 * it doesn't mention the duration, is too long, or doesn't parse.
 */
export function parseStartExpression(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text.length > MAX_EXPRESSION_LENGTH || !isStartExpression(text)) return null;
  return compiledExpression(text) ? text : null;
}

/** Evaluates a valid expression for a duration, in minutes rounded to the second (NaN if undefined, e.g. / 0). */
export function evaluateStartExpression(expression, durationMinutes) {
  const fn = compiledExpression(expression);
  const minutes = fn ? fn(durationMinutes) : NaN;
  return Number.isFinite(minutes) ? Math.round(minutes * 60) / 60 : NaN;
}

function normalizeStart(raw, fallback) {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return fallback;
  if (raw.expression !== undefined) {
    const expression = parseStartExpression(raw.expression);
    return expression ? { expression } : fallback;
  }
  const minutes = parseStartMinutes(raw.minutes);
  if (minutes === null) return fallback;
  return { minutes, plusDuration: raw.plusDuration === true };
}

/**
 * Fills in and validates one style. `base` supplies defaults (the built-in
 * definition, or a new custom style). Returns null if the style is unusable.
 */
export function normalizeStyle(raw, base) {
  if (!raw || typeof raw !== "object" || !base) return null;
  const style = { ...base };
  style.name = parseStyleName(raw.name) ?? base.name;
  if (typeof raw.enabled === "boolean") style.enabled = raw.enabled;
  // Inactive is the fallback and never has a start; other styles always do.
  style.start = base.start === null ? null : normalizeStart(raw.start, base.start) ?? base.start;
  if (isHexColor(raw.background)) style.background = raw.background.toLowerCase();
  if (isHexColor(raw.color)) style.color = raw.color.toLowerCase();
  if (Object.hasOwn(FONTS, raw.font)) style.font = raw.font;
  if (Object.hasOwn(WEIGHTS, raw.weight)) style.weight = Number(raw.weight);
  const size = Number(raw.sizePercent);
  if (Number.isFinite(size)) style.sizePercent = Math.min(MAX_SIZE_PERCENT, Math.max(MIN_SIZE_PERCENT, Math.round(size)));
  if (typeof raw.shadow === "boolean") style.shadow = raw.shadow;
  // The fallback style has no start, so nothing to time effects from.
  style.effects = style.start === null ? [] : normalizeEffects(raw.effects, base.effects);
  return style;
}

/**
 * Normalizes a stored list of styles: every built-in is present (restored
 * from defaults if missing), custom styles are validated, and ids are unique.
 */
export function normalizeStyles(raw) {
  const builtIns = new Map(defaultStyles().map((style) => [style.id, style]));
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const result = [];

  for (const item of list) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || seen.has(item.id)) continue;
    const builtIn = builtIns.get(item.id);
    const base = builtIn ?? newCustomStyle(item.id);
    const style = normalizeStyle(item, base);
    style.builtIn = !!builtIn;
    seen.add(style.id);
    result.push(style);
  }
  for (const [id, style] of builtIns) {
    if (!seen.has(id)) result.push(style);
  }
  return result;
}

/** Effective start in minutes from zero, or null for the fallback style. */
export function startMinutes(style, durationMinutes) {
  if (!style.start) return null;
  if (style.start.expression !== undefined) return evaluateStartExpression(style.start.expression, durationMinutes);
  return style.start.plusDuration ? durationMinutes + style.start.minutes : style.start.minutes;
}

/**
 * Which style applies with `remainingMs` until zero (negative when over time;
 * Infinity when idle). Returns the style (or null if none is enabled) and the
 * span it covers, in remaining milliseconds: it starts at `from` and gives way
 * to the next style at `to` (from > to while counting down).
 */
export function resolveStyle(styles, remainingMs, durationMinutes) {
  const fallback = styles.find((style) => style.enabled && style.start === null) ?? null;
  const timed = styles
    .filter((style) => style.enabled && style.start !== null)
    .map((style) => ({ style, at: startMinutes(style, durationMinutes) * MINUTE }))
    // An expression can be undefined for some durations (e.g. dividing by zero).
    .filter((t) => Number.isFinite(t.at));
  // Closest to zero first on each side; a stable sort keeps list order for ties.
  const before = timed.filter((t) => t.at > 0).sort((a, b) => a.at - b.at);
  const after = timed.filter((t) => t.at <= 0).sort((a, b) => b.at - a.at);

  if (remainingMs > 0) {
    const i = before.findIndex((t) => remainingMs <= t.at);
    if (i === -1) return { style: fallback, from: Infinity, to: before.at(-1)?.at ?? 0 };
    return { style: before[i].style, from: before[i].at, to: i > 0 ? before[i - 1].at : 0 };
  }
  const i = after.findIndex((t) => remainingMs >= t.at);
  if (i === -1) return { style: fallback, from: after.at(-1)?.at ?? 0, to: -Infinity };
  return { style: after[i].style, from: i > 0 ? after[i - 1].at : 0, to: after[i].at };
}

/** Styles in display order: the fallback first, then by start, largest to smallest. */
export function sortStylesForDisplay(styles, durationMinutes) {
  return styles
    .map((style, index) => {
      const at = startMinutes(style, durationMinutes);
      // Undefined expressions sort last.
      return { style, index, at: Number.isNaN(at) ? -Infinity : at };
    })
    .sort((a, b) => {
      if (a.at === null && b.at === null) return a.index - b.index;
      if (a.at === null) return -1;
      if (b.at === null) return 1;
      return b.at - a.at || a.index - b.index;
    })
    .map(({ style }) => style);
}

const formatMinutes = (minutes) => String(Number(minutes.toFixed(2)));

/** Human-readable start, e.g. "10 min (duration + 5)", "-60 min", "2 min ($duration / 10)", "Otherwise". */
export function describeStart(style, durationMinutes) {
  if (!style.start) return "Otherwise";
  const minutes = startMinutes(style, durationMinutes);
  if (style.start.expression !== undefined) {
    return Number.isNaN(minutes) ? `Undefined (${style.start.expression})` : `${formatMinutes(minutes)} min (${style.start.expression})`;
  }
  const total = `${formatMinutes(minutes)} min`;
  if (!style.start.plusDuration) return total;
  const offset = style.start.minutes;
  if (offset === 0) return `${total} (duration)`;
  return `${total} (duration ${offset > 0 ? "+" : "−"} ${formatMinutes(Math.abs(offset))})`;
}

/** CSS custom properties that apply a style to the page. */
export function styleToCss(style) {
  return {
    "--style-bg": style.background,
    "--style-fg": style.color,
    "--style-font": FONTS[style.font].family,
    "--style-weight": String(style.weight),
    "--style-scale": String(style.sizePercent / 100),
    "--style-shadow": style.shadow ? "0 0.04em 0.12em rgba(0, 0, 0, 0.45)" : "none",
  };
}
