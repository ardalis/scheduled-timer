import {
  DEFAULT_MINUTES,
  defaultStartTimeValue,
  describeDay,
  formatClock,
  formatTimespan,
  isStopped,
  MAX_OVERTIME_MS,
  nextOccurrence,
  parseCookie,
  parseTimeInput,
  scheduleCookieMaxAge,
  scheduleSummary,
  toTimeInputValue,
} from "./timer-core.js";
import {
  formatDurationMinutes,
  hasStoredConfig,
  loadConfig,
  parseDurationMinutes,
  saveConfig,
} from "./config.js";
import {
  findConflict,
  findOverlap,
  lastStarted,
  loadTalks,
  restoreTalks,
  saveTalks,
  sortTalks,
  TALKS_KEY,
  talkDurationMs,
  talkLabel,
} from "./talks-core.js";
import { resolveStyle } from "./styles-core.js";
import { effectState, fadeStyle } from "./effects-core.js";
import { applyStyleVars, setupStyleEditor } from "./style-editor.js";
import { setupThemePicker } from "./theme-picker.js";

const SCHEDULE_COOKIE = "scheduledStart";
// Older versions stored the duration in this cookie; it's migrated to the config.
const LEGACY_MINUTES_COOKIE = "timerMinutes";
const CONTROLS_IDLE_MS = 3000;
// Reset needs a second click within this time, so it's hard to hit by accident.
const RESET_CONFIRM_MS = 4000;

const $ = (id) => document.getElementById(id);
const els = {
  body: document.body,
  controls: $("controls"),
  status: $("status"),
  summary: $("summary"),
  display: $("display"),
  form: $("schedule-form"),
  startTime: $("start-time"),
  talkName: $("talk-name"),
  talkDuration: $("talk-duration"),
  scheduleError: $("schedule-error"),
  talks: $("talks"),
  talksToggle: $("talks-toggle"),
  talkList: $("talk-list"),
  cancelSchedule: $("cancel-schedule"),
  startPause: $("start-pause"),
  reset: $("reset"),
  fullscreen: $("fullscreen"),
  configButton: $("config-button"),
  configDialog: $("config-dialog"),
  configForm: $("config-form"),
  configDuration: $("config-duration"),
  configDurationError: $("config-duration-error"),
  configDurationPending: $("config-duration-pending"),
  configKeyboard: $("config-keyboard"),
  configStorageError: $("config-storage-error"),
  configCancel: $("config-cancel"),
};

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null; // e.g. storage disabled by browser settings
  }
})();

// ---- Cookies -------------------------------------------------------------

function setCookie(name, value, maxAgeSeconds) {
  document.cookie =
    `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  return parseCookie(document.cookie, name);
}

function deleteCookie(name) {
  document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`;
}

function formatLocalTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ---- State ---------------------------------------------------------------
// idle:     nothing scheduled, timer at full duration
// waiting:  scheduled start in the future
// running:  counting down toward endTime, then into negative (over time)
// paused:   stopped with `remaining` left (negative if paused over time)
// stopped:  an hour over time; the timer no longer counts

const state = {
  mode: "idle",
  styles: [],
  keyboardControl: false,
  defaultDurationMs: DEFAULT_MINUTES * 60 * 1000, // the presentation duration in configuration
  durationMs: DEFAULT_MINUTES * 60 * 1000, // of the current timer
  talks: [], // sorted by start; talks that haven't begun, and the one running on schedule
  talk: null, // the talk the timer is for, if any (out of `talks` once it's taken off schedule)
  scheduledStart: null, // epoch ms
  endTime: null, // epoch ms
  remaining: DEFAULT_MINUTES * 60 * 1000,
};

function setMode(mode) {
  state.mode = mode;
  els.body.dataset.state = mode;
  render();
}

function setDurationMinutes(minutes) {
  state.defaultDurationMs = Math.round(minutes * 60 * 1000);
  state.durationMs = talkDurationMs(state.talk, state.defaultDurationMs);
  if (state.mode === "idle" || state.mode === "waiting" || state.mode === "stopped") {
    state.remaining = state.durationMs;
    if (state.mode === "stopped") setMode("idle");
  }
}

function setScheduleCookie(talk) {
  // Keep the cookie a little past the end of the timer so a reload mid-talk resumes.
  setCookie(SCHEDULE_COOKIE, String(talk.start), scheduleCookieMaxAge(talk.start, state.durationMs, Date.now()));
}

/** Waits for the next talk, or goes idle if there are none left. */
function armNextTalk() {
  const next = state.talks[0] ?? null;
  state.talk = next;
  state.durationMs = talkDurationMs(next, state.defaultDurationMs);
  state.remaining = state.durationMs;
  state.endTime = null;
  if (next) {
    state.scheduledStart = next.start;
    setScheduleCookie(next);
    setMode("waiting");
  } else {
    clearSchedule();
    setMode("idle");
  }
}

/** Starts a talk that has reached its start time, replacing whatever was on the timer. */
function beginTalk(talk, now) {
  // Any earlier talks were missed, or are over: this one's start takes over from them.
  state.talks = state.talks.filter((other) => other.start >= talk.start);
  saveTalks(storage, state.talks);
  state.talk = talk;
  state.durationMs = talkDurationMs(talk, state.defaultDurationMs);
  // Anchor the end to the scheduled start so the timer stays accurate even
  // if the tab was throttled in the background.
  const endTime = talk.start + state.durationMs;
  if (isStopped(endTime - now)) {
    // The whole timer, and the hour after it, passed while the tab was asleep.
    stop();
  } else {
    // The cookie is kept (it expires after the timer stops) so a reload resumes.
    state.scheduledStart = null;
    setScheduleCookie(talk);
    start(endTime);
  }
}

function clearSchedule() {
  state.scheduledStart = null;
  deleteCookie(SCHEDULE_COOKIE);
}

/** Takes the current talk off the schedule; the timer can keep running for it. */
function unscheduleCurrentTalk() {
  state.talks = state.talks.filter((talk) => talk !== state.talk);
  saveTalks(storage, state.talks);
  clearSchedule();
}

function start(endTime = Date.now() + state.remaining) {
  state.endTime = endTime;
  setMode("running");
}

function pause() {
  unscheduleCurrentTalk();
  state.remaining = Math.max(-MAX_OVERTIME_MS, state.endTime - Date.now());
  state.endTime = null;
  setMode("paused");
}

function reset() {
  unscheduleCurrentTalk();
  armNextTalk();
}

// ---- Rendering -----------------------------------------------------------

function currentRemaining(now) {
  return state.mode === "running" ? Math.max(-MAX_OVERTIME_MS, state.endTime - now) : state.remaining;
}

function render() {
  const now = Date.now();
  const remaining = currentRemaining(now);
  const clock = formatClock(remaining);
  if (els.display.textContent !== clock) {
    els.display.textContent = clock;
    els.display.style.setProperty("--chars", clock.length);
    fitDisplay();
  }
  document.title = state.mode === "running" || state.mode === "paused" ? `${clock} · Scheduled Timer` : "Scheduled Timer";

  const baseStyle = renderStyle(now, remaining);
  renderSummary(now, baseStyle);
  // Over time once the clock reads 00:00 or less.
  els.body.classList.toggle("overtime", state.mode !== "idle" && state.mode !== "waiting" && remaining <= 0);

  const name = state.talk?.name ?? "";
  let status = "";
  if (state.mode === "waiting") {
    status = `${name || "Timer"} will begin in ${formatTimespan(state.scheduledStart - now)}.`;
  } else if (state.mode === "running") {
    status = name;
  } else if (state.mode === "paused") {
    status = name ? `Paused: ${name}` : "Paused";
  } else if (state.mode === "stopped") {
    status = "Stopped after an hour over time.";
  }
  if (els.status.textContent !== status) els.status.textContent = status;

  renderTalkList(now);
  els.cancelSchedule.hidden = state.mode !== "waiting";
  els.cancelSchedule.textContent = state.talks.length > 1 ? "Cancel next talk" : "Cancel schedule";
  els.startPause.textContent =
    state.mode === "running" ? "Pause" : state.mode === "paused" ? "Resume" : "Start now";
  els.startTime.title =
    state.mode === "waiting" ? `Scheduled for ${formatLocalTime(new Date(state.scheduledStart))}` : "";
}

function stop() {
  unscheduleCurrentTalk();
  state.talk = null;
  if (state.talks.length) {
    armNextTalk();
    return;
  }
  state.durationMs = state.defaultDurationMs;
  state.remaining = -MAX_OVERTIME_MS;
  state.endTime = null;
  setMode("stopped");
}

let talkListKey = "";

/** Lists the talks yet to begin, rebuilt only when they change so focus isn't lost. */
function renderTalkList(now) {
  const rows = state.talks
    .filter((talk) => talk.start > now)
    .map((talk) => {
      const start = new Date(talk.start);
      return {
        start: talk.start,
        label: talkLabel(talk),
        when: `${formatLocalTime(start)} ${describeDay(start, new Date(now))}`,
        minutes: formatDurationMinutes(talkDurationMs(talk, state.defaultDurationMs) / 60000),
      };
    });
  const key = JSON.stringify(rows);
  if (key === talkListKey) return;
  talkListKey = key;
  els.talks.hidden = rows.length === 0;
  if (rows.length === 0) els.talks.open = false;
  els.talksToggle.textContent = `Upcoming talks (${rows.length})`;
  els.talkList.replaceChildren(
    ...rows.map(({ start, label, when, minutes }) => {
      const cell = (className, text) => {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        return span;
      };
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.start = start;
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${label}`);
      const row = document.createElement("li");
      row.append(cell("talk-when", when), cell("talk-name", label), cell("talk-minutes", `${minutes} min`), remove);
      return row;
    })
  );
}

// ---- Styles ----------------------------------------------------------------

/** Time until zero for choosing a style; includes the wait before a scheduled start. */
function styleRemaining(now, remaining) {
  if (state.mode === "idle") return Infinity;
  if (state.mode === "waiting") return state.durationMs + (state.scheduledStart - now);
  return remaining;
}

let appliedStyleKey = null;

/** Effects only play while time is moving: waiting for the start, or running. */
function currentEffects(resolved, distance) {
  const { style, from, to } = resolved;
  if (!style || (state.mode !== "running" && state.mode !== "waiting")) return { strobe: false, fade: null };
  // Counting down, so the style began at `from` and ends at `to`.
  return effectState(style.effects, from - distance, from - to);
}

function renderStyle(now, remaining) {
  const durationMinutes = state.durationMs / 60000;
  const distance = styleRemaining(now, remaining);
  const resolved = resolveStyle(state.styles, distance, durationMinutes);
  const effects = currentEffects(resolved, distance);
  els.body.classList.toggle("effect-strobe", effects.strobe);

  let { style } = resolved;
  if (style && effects.fade !== null) {
    // The style that takes over at the end of this one.
    style = fadeStyle(style, resolveStyle(state.styles, resolved.to, durationMinutes).style, effects.fade);
  }
  const key = style ? JSON.stringify(style) : "";
  if (key !== appliedStyleKey) {
    appliedStyleKey = key;
    els.body.classList.toggle("styled", !!style);
    els.body.dataset.style = style?.id ?? "";
    if (style) applyStyleVars(els.body, style);
    fitDisplay();
  }
  return resolved.style;
}

/**
 * While a start is scheduled and the Inactive look applies (no style is
 * timed yet), shows a card summarizing the presentation's timing.
 */
function renderSummary(now, style) {
  const show = state.mode === "waiting" && (!style || style.start === null);
  if (els.summary.hidden === show) {
    els.summary.hidden = !show;
    els.body.classList.toggle("show-summary", show);
    fitDisplay();
  }
  if (!show) return;
  const lines = scheduleSummary(state.durationMs / 60000, state.scheduledStart, now, formatLocalTime, state.talk?.name);
  [...els.summary.children].forEach((line, i) => {
    if (line.textContent !== lines[i]) line.textContent = lines[i];
  });
}

/** Shrinks the readout if the current font is wider than the window allows. */
function fitDisplay() {
  els.display.style.setProperty("--fit", "1");
  const available = window.innerWidth * 0.96;
  const width = els.display.scrollWidth;
  if (width > available) els.display.style.setProperty("--fit", String(available / width));
}

window.addEventListener("resize", fitDisplay);
document.fonts?.addEventListener?.("loadingdone", fitDisplay);

function tick() {
  const now = Date.now();
  // A talk starts on time whatever the timer is doing, even if the last one ran long.
  const due = lastStarted(state.talks, now);
  if (due && !(state.mode === "running" && due === state.talk)) {
    beginTalk(due, now);
  } else if (state.mode === "running" && isStopped(state.endTime - now)) {
    stop();
  }
  render();
}

// ---- Events --------------------------------------------------------------

function showScheduleError(message, { invalidDuration = false } = {}) {
  els.scheduleError.textContent = message;
  els.scheduleError.hidden = !message;
  els.talkDuration.setAttribute("aria-invalid", invalidDuration ? "true" : "false");
}

function overlapMessage(other) {
  const end = new Date(other.start + talkDurationMs(other, state.defaultDurationMs));
  return `That overlaps ${talkLabel(other)} (${formatLocalTime(new Date(other.start))} to ${formatLocalTime(end)}). Talks can't overlap, so choose another time or remove that talk.`;
}

/**
 * The timer in progress as a talk ending when the timer will, if it's for a
 * talk that's off the schedule (paused, or started early) and has time left.
 */
function talkInProgress(now) {
  if (!state.talk || state.talks.includes(state.talk)) return null;
  if (state.mode !== "running" && state.mode !== "paused") return null;
  const remaining = currentRemaining(now);
  return remaining > 0 ? { name: state.talk.name, start: now, durationMinutes: remaining / 60000 } : null;
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const time = parseTimeInput(els.startTime.value);
  if (!time) return;
  const durationText = els.talkDuration.value.trim();
  const durationMinutes = durationText === "" ? null : parseDurationMinutes(durationText);
  if (durationText !== "" && durationMinutes === null) {
    showScheduleError("Enter a number of minutes greater than 0 and at most 1440, or leave it blank.", { invalidDuration: true });
    els.talkDuration.focus();
    return;
  }
  const talk = {
    name: els.talkName.value.trim(),
    start: nextOccurrence(time.hours, time.minutes).getTime(),
    durationMinutes,
  };
  const inProgress = talkInProgress(Date.now());
  const conflict = findConflict(talk, inProgress ? [inProgress, ...state.talks] : state.talks, state.defaultDurationMs);
  if (conflict) {
    showScheduleError(overlapMessage(conflict));
    return;
  }
  state.talks = sortTalks([...state.talks, talk]);
  const saved = saveTalks(storage, state.talks);
  showScheduleError(saved ? "" : "Talks couldn't be saved in this browser, so they may be lost on reload.");
  els.talkName.value = "";
  els.talkDuration.value = "";
  // A timer in progress finishes or is interrupted by the talk's start, not by adding it.
  if (state.mode === "running" || state.mode === "paused") render();
  else armNextTalk();
  // Don't leave the time (or the button) focused, where a remote's keys would change it.
  document.activeElement?.blur();
});

els.talkName.addEventListener("input", () => showScheduleError(""));
els.talkDuration.addEventListener("input", () => showScheduleError(""));
els.startTime.addEventListener("input", () => showScheduleError(""));

// A double click shouldn't also take out the next talk, which moves under the mouse.
els.cancelSchedule.addEventListener("click", (event) => {
  if (event.detail <= 1) reset();
});

els.talkList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || event.detail > 1) return;
  const start = Number(button.dataset.start);
  state.talks = state.talks.filter((talk) => talk.start !== start);
  saveTalks(storage, state.talks);
  showScheduleError("");
  if (state.mode === "waiting") armNextTalk();
  else render();
  // The button is gone, so a keyboard user needs somewhere to continue from.
  // Not another Remove button, where a remote's Enter would remove that talk too.
  if (event.detail === 0) els.controls.focus();
});

// Another tab changed the talks. Without this, saving here would undo its changes.
window.addEventListener("storage", (event) => {
  if (event.key !== TALKS_KEY) return;
  const currentStart = state.talk?.start;
  state.talks = loadTalks(storage);
  state.talk = state.talks.find((talk) => talk.start === currentStart) ?? state.talk;
  if (state.mode === "running" || state.mode === "paused") render();
  else armNextTalk();
});

// ---- Configuration -------------------------------------------------------

function applyConfig(config) {
  state.styles = config.styles;
  state.keyboardControl = config.keyboardControl;
  setDurationMinutes(config.durationMinutes);
  // Re-save the cookie so its lifetime covers the new duration.
  if (state.mode === "waiting") armNextTalk();
  render();
}

function showDurationError(message) {
  els.configDurationError.textContent = message;
  els.configDurationError.hidden = !message;
  els.configDuration.setAttribute("aria-invalid", message ? "true" : "false");
}

// Edits in the dialog go to a draft that Save writes to storage.
let draft = null;

const styleEditor = setupStyleEditor({
  getStyles: () => draft.styles,
  setStyles: (styles) => {
    draft.styles = styles;
    themePicker.render();
  },
  // Show relative starts against the duration being typed, if it's valid.
  getDurationMinutes: () => parseDurationMinutes(els.configDuration.value) ?? draft.durationMinutes,
});

const themePicker = setupThemePicker({
  getDraft: () => draft,
  applyStyles: (styles) => {
    draft.styles = styles;
    styleEditor.renderList();
  },
});

function openConfig() {
  // Always reload from storage, so the dialog shows what is actually saved.
  draft = loadConfig(storage);
  els.configDuration.value = formatDurationMinutes(draft.durationMinutes);
  els.configKeyboard.checked = draft.keyboardControl;
  styleEditor.renderList();
  themePicker.reset();
  showDurationError("");
  els.configStorageError.hidden = true;
  els.configDurationPending.hidden = !(state.mode === "running" || state.mode === "paused");
  els.configDialog.showModal();
  els.configDuration.select();
}

els.configButton.addEventListener("click", openConfig);
els.configCancel.addEventListener("click", () => els.configDialog.close());

els.configForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const durationMinutes = parseDurationMinutes(els.configDuration.value);
  if (durationMinutes === null) {
    showDurationError("Enter a number of minutes greater than 0 and at most 1440.");
    els.configDuration.focus();
    return;
  }
  // Talks with no duration of their own follow this one, which could make them overlap.
  const durationMs = Math.round(durationMinutes * 60 * 1000);
  const overlap = durationMs !== state.defaultDurationMs && findOverlap(state.talks, durationMs);
  if (overlap) {
    showDurationError(`With that duration, ${talkLabel(overlap[0])} would overlap ${talkLabel(overlap[1])}.`);
    els.configDuration.focus();
    return;
  }
  const config = { ...draft, durationMinutes, keyboardControl: els.configKeyboard.checked };
  const saved = saveConfig(storage, config);
  applyConfig(config);
  if (saved) {
    els.configDialog.close();
  } else {
    els.configStorageError.hidden = false;
  }
});

els.configDuration.addEventListener("input", () => {
  showDurationError("");
  styleEditor.renderList();
});

els.startPause.addEventListener("click", () => {
  if (state.mode === "running") {
    pause();
  } else {
    if (state.mode === "waiting") unscheduleCurrentTalk();
    if (state.mode === "stopped") state.remaining = state.durationMs;
    start();
  }
});

let resetArmedTimer = null;

function disarmReset() {
  clearTimeout(resetArmedTimer);
  resetArmedTimer = null;
  els.reset.classList.remove("armed");
  els.reset.textContent = "Reset";
}

els.reset.addEventListener("click", () => {
  if (resetArmedTimer === null) {
    els.reset.classList.add("armed");
    els.reset.textContent = "Confirm reset";
    resetArmedTimer = setTimeout(disarmReset, RESET_CONFIRM_MS);
    return;
  }
  disarmReset();
  reset();
});

// A mouse click shouldn't leave a control focused: keys from a presentation
// remote would go to it (Enter or Space would click it again). Keyboard users
// keep focus as usual; a click from the keyboard has detail 0.
els.controls.addEventListener("click", (event) => {
  const control = event.target.closest("button, summary");
  if (control && event.detail > 0) control.blur();
});

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

els.fullscreen.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  els.fullscreen.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
});

document.addEventListener("keydown", (event) => {
  if (els.configDialog.open) return;
  if (event.target instanceof HTMLInputElement) return;
  // Let focused buttons handle Space/Enter themselves.
  if ((event.target instanceof HTMLButtonElement || event.target === els.talksToggle) && event.key === " ") return;
  if (event.key === "f" || event.key === "F") {
    toggleFullscreen();
  } else if (event.key === " " && state.keyboardControl) {
    event.preventDefault();
    els.startPause.click();
  }
});

// Hide controls and cursor while the timer runs and the mouse is idle.
let idleTimer = null;
function showControls() {
  els.body.classList.remove("controls-hidden");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const focusedInControls = els.controls.contains(document.activeElement)
      && document.activeElement instanceof HTMLInputElement;
    if (state.mode === "running" && !focusedInControls && !els.configDialog.open) {
      els.body.classList.add("controls-hidden");
    }
  }, CONTROLS_IDLE_MS);
}
["mousemove", "mousedown", "touchstart", "keydown"].forEach((type) =>
  document.addEventListener(type, showControls, { passive: true })
);

// ---- Init ----------------------------------------------------------------

function loadInitialConfig() {
  const config = loadConfig(storage);
  const legacy = getCookie(LEGACY_MINUTES_COOKIE);
  if (legacy === null) return config;
  const legacyMinutes = parseDurationMinutes(legacy);
  if (legacyMinutes !== null && !hasStoredConfig(storage)) {
    config.durationMinutes = legacyMinutes;
    saveConfig(storage, config);
  }
  deleteCookie(LEGACY_MINUTES_COOKIE);
  return config;
}

function init() {
  const config = loadInitialConfig();
  state.styles = config.styles;
  state.keyboardControl = config.keyboardControl;
  setDurationMinutes(config.durationMinutes);

  const now = Date.now();
  state.talks = restoreTalks(loadTalks(storage), getCookie(SCHEDULE_COOKIE), state.defaultDurationMs, now);
  const started = lastStarted(state.talks, now);
  if (started) {
    // Reloaded mid-timer: resume where it should be.
    els.startTime.value = defaultStartTimeValue();
    beginTalk(started, now);
  } else {
    els.startTime.value = state.talks.length ? toTimeInputValue(new Date(state.talks[0].start)) : defaultStartTimeValue();
    armNextTalk();
  }

  showControls();
  setInterval(tick, 200);
}

init();
