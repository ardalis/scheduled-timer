import {
  DEFAULT_MINUTES,
  clampMinutes,
  defaultStartTimeValue,
  formatClock,
  formatTimespan,
  nextOccurrence,
  parseCookie,
  parseTimeInput,
  restoreSchedule,
  scheduleCookieMaxAge,
  toTimeInputValue,
} from "./timer-core.js";

const SCHEDULE_COOKIE = "scheduledStart";
const MINUTES_COOKIE = "timerMinutes";
const CONTROLS_IDLE_MS = 3000;

const $ = (id) => document.getElementById(id);
const els = {
  body: document.body,
  status: $("status"),
  display: $("display"),
  form: $("schedule-form"),
  startTime: $("start-time"),
  cancelSchedule: $("cancel-schedule"),
  duration: $("duration"),
  startPause: $("start-pause"),
  reset: $("reset"),
  fullscreen: $("fullscreen"),
};

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
// running:  counting down toward endTime
// paused:   stopped with `remaining` left
// finished: reached 00:00

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
  const value = clampMinutes(minutes);
  els.duration.value = value;
  state.durationMs = value * 60 * 1000;
  setCookie(MINUTES_COOKIE, String(value), 365 * 24 * 60 * 60);
  if (state.mode === "idle" || state.mode === "waiting" || state.mode === "finished") {
    state.remaining = state.durationMs;
    if (state.mode === "finished") setMode("idle");
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
  state.remaining = Math.max(0, state.endTime - Date.now());
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
  return state.mode === "running" ? Math.max(0, state.endTime - now) : state.remaining;
}

function render() {
  const now = Date.now();
  const remaining = currentRemaining(now);
  const clock = formatClock(remaining);
  if (els.display.textContent !== clock) els.display.textContent = clock;
  document.title = state.mode === "running" ? `${clock} · Scheduled Timer` : "Scheduled Timer";

  els.body.classList.toggle(
    "final-minute",
    state.mode === "running" && remaining <= 60 * 1000
  );

  let status = "";
  if (state.mode === "waiting") {
    status = `Timer will begin in ${formatTimespan(state.scheduledStart - now)}.`;
  } else if (state.mode === "paused") {
    status = "Paused";
  } else if (state.mode === "finished") {
    status = "Time's up!";
  }
  if (els.status.textContent !== status) els.status.textContent = status;

  els.cancelSchedule.hidden = state.mode !== "waiting";
  els.startPause.textContent =
    state.mode === "running" ? "Pause" : state.mode === "paused" ? "Resume" : "Start now";
  els.duration.disabled = state.mode === "running" || state.mode === "paused";
  els.startTime.title =
    state.mode === "waiting" ? `Scheduled for ${formatLocalTime(new Date(state.scheduledStart))}` : "";
}

function tick() {
  const now = Date.now();
  if (state.mode === "waiting" && now >= state.scheduledStart) {
    // Anchor the end to the scheduled start so the timer stays accurate even
    // if the tab was throttled in the background.
    const endTime = state.scheduledStart + state.durationMs;
    if (endTime > now) {
      // The cookie is kept (it expires after the timer ends) so a reload resumes.
      state.scheduledStart = null;
      start(endTime);
    } else {
      // The whole timer elapsed while the tab was asleep.
      clearSchedule();
      state.remaining = 0;
      setMode("finished");
    }
  } else if (state.mode === "running" && now >= state.endTime) {
    clearSchedule();
    state.remaining = 0;
    state.endTime = null;
    setMode("finished");
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

els.duration.addEventListener("change", () => {
  setDurationMinutes(els.duration.value);
  // Re-save the cookie so its lifetime covers the new duration.
  if (state.mode === "waiting") schedule(state.scheduledStart);
  render();
});

els.startPause.addEventListener("click", () => {
  if (state.mode === "running") {
    pause();
  } else {
    if (state.mode === "waiting") clearSchedule();
    if (state.mode === "finished") state.remaining = state.durationMs;
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
    if (state.mode === "running" && !focusedInControls) {
      els.body.classList.add("controls-hidden");
    }
  }, CONTROLS_IDLE_MS);
}
["mousemove", "mousedown", "touchstart", "keydown"].forEach((type) =>
  document.addEventListener(type, showControls, { passive: true })
);

// ---- Init ----------------------------------------------------------------

function init() {
  setDurationMinutes(getCookie(MINUTES_COOKIE) ?? DEFAULT_MINUTES);

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
