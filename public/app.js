(() => {
  "use strict";

  const DEFAULT_MINUTES = 5;
  const SCHEDULE_COOKIE = "scheduledStart";
  const MINUTES_COOKIE = "timerMinutes";
  const DAY_MS = 24 * 60 * 60 * 1000;
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
    const match = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  }

  function deleteCookie(name) {
    document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`;
  }

  // ---- Time helpers --------------------------------------------------------

  /** Next local Date at hh:mm that is after `now` (always within 24 hours). */
  function nextOccurrence(hours, minutes, now = new Date()) {
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target;
  }

  /** mm:ss, where minutes may exceed 59 for long timers. */
  function formatClock(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  /** Natural-language span, e.g. "2 hours and 5 minutes" or "45 seconds". */
  function formatTimespan(ms) {
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
    const value = Math.min(999, Math.max(1, Math.round(Number(minutes) || DEFAULT_MINUTES)));
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
    const maxAge = Math.ceil((startMs - Date.now() + state.durationMs) / 1000) + 60;
    setCookie(SCHEDULE_COOKIE, String(startMs), Math.max(60, maxAge));
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
      // The cookie is kept (it expires after the timer ends) so a reload resumes.
      const endTime = state.scheduledStart + state.durationMs;
      state.scheduledStart = null;
      if (endTime > now) {
        start(endTime);
      } else {
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
    const [h, m] = els.startTime.value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    schedule(nextOccurrence(h, m).getTime());
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

    const saved = Number(getCookie(SCHEDULE_COOKIE));
    const now = Date.now();
    if (saved && saved > now && saved - now <= DAY_MS) {
      const d = new Date(saved);
      els.startTime.value =
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      schedule(saved);
    } else if (saved && saved <= now && saved + state.durationMs > now) {
      // Reloaded mid-timer: resume where it should be.
      start(saved + state.durationMs);
    } else {
      if (saved) clearSchedule();
      const next = new Date(now + 60 * 60 * 1000);
      els.startTime.value = `${String(next.getHours()).padStart(2, "0")}:00`;
      setMode("idle");
    }

    showControls();
    setInterval(tick, 200);
  }

  // Exposed for quick testing in the console.
  window.scheduledTimer = { nextOccurrence, formatTimespan, formatClock };

  init();
})();
