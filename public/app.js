import {
  DEFAULT_MINUTES,
  defaultStartTimeValue,
  formatClock,
  formatTimespan,
  isStopped,
  MAX_OVERTIME_MS,
  nextOccurrence,
  parseCookie,
  parseTimeInput,
  restoreSchedule,
  scheduleCookieMaxAge,
  toTimeInputValue,
} from "./timer-core.js";
import {
  formatDurationMinutes,
  hasStoredConfig,
  loadConfig,
  parseDurationMinutes,
  saveConfig,
} from "./config.js";

const SCHEDULE_COOKIE = "scheduledStart";
// Older versions stored the duration in this cookie; it's migrated to the config.
const LEGACY_MINUTES_COOKIE = "timerMinutes";
const CONTROLS_IDLE_MS = 3000;

const $ = (id) => document.getElementById(id);
const els = {
  body: document.body,
  status: $("status"),
  display: $("display"),
  form: $("schedule-form"),
  startTime: $("start-time"),
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
  durationMs: DEFAULT_MINUTES * 60 * 1000,
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
  state.durationMs = Math.round(minutes * 60 * 1000);
  if (state.mode === "idle" || state.mode === "waiting" || state.mode === "stopped") {
    state.remaining = state.durationMs;
    if (state.mode === "stopped") setMode("idle");
  }
}

function schedule(startMs) {
  state.scheduledStart = startMs;
  state.endTime = null;
  state.remaining = state.durationMs;
  // Keep the cookie a little past the end of the timer so a reload mid-talk resumes.
  setCookie(SCHEDULE_COOKIE, String(startMs), scheduleCookieMaxAge(startMs, state.durationMs, Date.now()));
  setMode("waiting");
}

function clearSchedule() {
  state.scheduledStart = null;
  deleteCookie(SCHEDULE_COOKIE);
}

function start(endTime = Date.now() + state.remaining) {
  state.endTime = endTime;
  setMode("running");
}

function pause() {
  clearSchedule();
  state.remaining = Math.max(-MAX_OVERTIME_MS, state.endTime - Date.now());
  state.endTime = null;
  setMode("paused");
}

function reset() {
  clearSchedule();
  state.endTime = null;
  state.remaining = state.durationMs;
  setMode("idle");
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
  }
  document.title = state.mode === "running" || state.mode === "paused" ? `${clock} · Scheduled Timer` : "Scheduled Timer";

  els.body.classList.toggle(
    "final-minute",
    state.mode === "running" && remaining <= 60 * 1000 && remaining > 0
  );
  // Over time once the clock reads 00:00 or less.
  els.body.classList.toggle("overtime", state.mode !== "idle" && state.mode !== "waiting" && remaining <= 0);

  let status = "";
  if (state.mode === "waiting") {
    status = `Timer will begin in ${formatTimespan(state.scheduledStart - now)}.`;
  } else if (state.mode === "paused") {
    status = "Paused";
  } else if (state.mode === "stopped") {
    status = "Stopped after an hour over time.";
  }
  if (els.status.textContent !== status) els.status.textContent = status;

  els.cancelSchedule.hidden = state.mode !== "waiting";
  els.startPause.textContent =
    state.mode === "running" ? "Pause" : state.mode === "paused" ? "Resume" : "Start now";
  els.startTime.title =
    state.mode === "waiting" ? `Scheduled for ${formatLocalTime(new Date(state.scheduledStart))}` : "";
}

function stop() {
  clearSchedule();
  state.remaining = -MAX_OVERTIME_MS;
  state.endTime = null;
  setMode("stopped");
}

function tick() {
  const now = Date.now();
  if (state.mode === "waiting" && now >= state.scheduledStart) {
    // Anchor the end to the scheduled start so the timer stays accurate even
    // if the tab was throttled in the background.
    const endTime = state.scheduledStart + state.durationMs;
    if (isStopped(endTime - now)) {
      // The whole timer, and the hour after it, passed while the tab was asleep.
      stop();
    } else {
      // The cookie is kept (it expires after the timer stops) so a reload resumes.
      state.scheduledStart = null;
      start(endTime);
    }
  } else if (state.mode === "running" && isStopped(state.endTime - now)) {
    stop();
  }
  render();
}

// ---- Events --------------------------------------------------------------

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const time = parseTimeInput(els.startTime.value);
  if (!time) return;
  schedule(nextOccurrence(time.hours, time.minutes).getTime());
});

els.cancelSchedule.addEventListener("click", reset);

// ---- Configuration -------------------------------------------------------

function applyConfig(config) {
  setDurationMinutes(config.durationMinutes);
  // Re-save the cookie so its lifetime covers the new duration.
  if (state.mode === "waiting") schedule(state.scheduledStart);
  render();
}

function showDurationError(message) {
  els.configDurationError.textContent = message;
  els.configDurationError.hidden = !message;
  els.configDuration.setAttribute("aria-invalid", message ? "true" : "false");
}

function openConfig() {
  // Always reload from storage, so the dialog shows what is actually saved.
  const config = loadConfig(storage);
  els.configDuration.value = formatDurationMinutes(config.durationMinutes);
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
  const config = { ...loadConfig(storage), durationMinutes };
  const saved = saveConfig(storage, config);
  applyConfig(config);
  if (saved) {
    els.configDialog.close();
  } else {
    els.configStorageError.hidden = false;
  }
});

els.configDuration.addEventListener("input", () => showDurationError(""));

els.startPause.addEventListener("click", () => {
  if (state.mode === "running") {
    pause();
  } else {
    if (state.mode === "waiting") clearSchedule();
    if (state.mode === "stopped") state.remaining = state.durationMs;
    start();
  }
});

els.reset.addEventListener("click", reset);

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
  if (event.target instanceof HTMLButtonElement && event.key === " ") return;
  if (event.key === "f" || event.key === "F") {
    toggleFullscreen();
  } else if (event.key === " ") {
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
    const focusedInControls = document.getElementById("controls").contains(document.activeElement)
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
  setDurationMinutes(loadInitialConfig().durationMinutes);

  const restored = restoreSchedule(getCookie(SCHEDULE_COOKIE), state.durationMs, Date.now());
  if (restored.mode === "waiting") {
    els.startTime.value = toTimeInputValue(new Date(restored.start));
    schedule(restored.start);
  } else if (restored.mode === "running") {
    // Reloaded mid-timer: resume where it should be.
    start(restored.endTime);
  } else {
    if (restored.stale) clearSchedule();
    els.startTime.value = defaultStartTimeValue();
    setMode("idle");
  }

  showControls();
  setInterval(tick, 200);
}

init();
