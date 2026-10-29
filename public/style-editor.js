// The style list in the configuration dialog and the edit style dialog.
// Edits go to a draft owned by the configuration dialog, which saves them.

import { formatClock } from "./timer-core.js";
import {
  FONTS,
  WEIGHTS,
  MAX_START_MINUTES,
  describeStart,
  isStartExpression,
  newCustomStyle,
  parseStartExpression,
  parseStartMinutes,
  parseStyleName,
  sortStylesForDisplay,
  startMinutes,
  styleToCss,
} from "./styles-core.js";
import { EFFECT_TYPES, MAX_EFFECT_SECONDS, describeEffect, newEffect, parseEffectSeconds } from "./effects-core.js";

const BUILT_IN_DELETE_TOOLTIP = "Built-in styles cannot be deleted.";

export function applyStyleVars(element, style) {
  for (const [name, value] of Object.entries(styleToCss(style))) element.style.setProperty(name, value);
}

/**
 * @param {object} options
 * @param {() => object[]} options.getStyles   current draft styles
 * @param {(styles: object[]) => void} options.setStyles
 * @param {() => number} options.getDurationMinutes  duration to show relative starts against
 */
export function setupStyleEditor({ getStyles, setStyles, getDurationMinutes }) {
  const $ = (id) => document.getElementById(id);
  const els = {
    list: $("style-list"),
    add: $("add-style"),
    dialog: $("style-dialog"),
    form: $("style-form"),
    title: $("style-dialog-title"),
    preview: $("style-preview"),
    previewClock: $("style-preview-clock"),
    name: $("style-name"),
    nameError: $("style-name-error"),
    startField: $("style-start-field"),
    start: $("style-start"),
    plusDuration: $("style-plus-duration"),
    startHint: $("style-start-hint"),
    startError: $("style-start-error"),
    fallbackHint: $("style-fallback-hint"),
    background: $("style-background"),
    color: $("style-color"),
    font: $("style-font"),
    weight: $("style-weight"),
    size: $("style-size"),
    sizeValue: $("style-size-value"),
    shadow: $("style-shadow"),
    enabled: $("style-enabled"),
    effectsField: $("style-effects-field"),
    effectType: $("effect-type"),
    addEffect: $("add-effect"),
    effectList: $("effect-list"),
    effectError: $("effect-error"),
    deleteWrap: $("style-delete-wrap"),
    deleteButton: $("style-delete"),
    cancel: $("style-cancel"),
  };

  for (const [value, { label }] of Object.entries(FONTS)) els.font.add(new Option(label, value));
  for (const [value, label] of Object.entries(WEIGHTS)) els.weight.add(new Option(label, value));
  for (const [value, { label }] of Object.entries(EFFECT_TYPES)) els.effectType.add(new Option(label, value));

  let editing = null; // working copy of the style in the dialog
  let isNew = false;

  // ---- List ----------------------------------------------------------------

  function renderList() {
    const duration = getDurationMinutes();
    els.list.replaceChildren(
      ...sortStylesForDisplay(getStyles(), duration).map((style) => {
        const item = document.createElement("li");
        item.className = "style-item";
        item.dataset.styleId = style.id;
        item.classList.toggle("is-disabled", !style.enabled);

        const row = document.createElement("button");
        row.type = "button";
        row.className = "style-row";
        row.setAttribute("aria-label", `Edit ${style.name}`);
        row.addEventListener("click", () => openEditor(style.id));

        const swatch = document.createElement("span");
        swatch.className = "style-swatch";
        swatch.textContent = "12";
        swatch.setAttribute("aria-hidden", "true");
        applyStyleVars(swatch, style);

        const name = document.createElement("span");
        name.className = "style-name";
        name.textContent = style.name;

        const start = document.createElement("span");
        start.className = "style-start";
        start.textContent = describeStart(style, duration);

        row.append(swatch, name, start);

        const toggleLabel = document.createElement("label");
        toggleLabel.className = "checkbox";
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = style.enabled;
        toggle.setAttribute("aria-label", `Enable ${style.name}`);
        toggle.addEventListener("change", () => {
          setStyles(getStyles().map((s) => (s.id === style.id ? { ...s, enabled: toggle.checked } : s)));
          renderList();
        });
        toggleLabel.append(toggle, " Enabled");

        item.append(row, toggleLabel);
        return item;
      })
    );
  }

  // ---- Effects -------------------------------------------------------------

  function secondsInput(className, label, value) {
    const wrap = document.createElement("label");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = String(MAX_EFFECT_SECONDS);
    input.step = "1";
    input.inputMode = "numeric";
    input.className = className;
    input.value = String(value);
    wrap.append(label, input, "s");
    return wrap;
  }

  function renderEffects() {
    els.effectList.replaceChildren(
      ...editing.effects.map((effect) => {
        const { label, hasDuration } = EFFECT_TYPES[effect.type];
        const item = document.createElement("li");
        item.className = "effect-item";
        item.dataset.effectId = effect.id;
        item.classList.toggle("is-disabled", !effect.enabled);

        const name = document.createElement("span");
        name.className = "effect-name";
        name.textContent = describeEffect(effect);

        const toggleLabel = document.createElement("label");
        toggleLabel.className = "checkbox";
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.className = "effect-enabled";
        toggle.checked = effect.enabled;
        toggle.setAttribute("aria-label", `Enable ${label}`);
        toggleLabel.append(toggle, " Enabled");

        const start = secondsInput("effect-start", "Starts after", effect.startSeconds);
        start.querySelector("input").setAttribute("aria-label", `${label} starts after (seconds)`);
        item.append(name, toggleLabel, start);

        if (hasDuration) {
          const duration = secondsInput("effect-duration", "Lasts", effect.durationSeconds);
          const input = duration.querySelector("input");
          input.setAttribute("aria-label", `${label} lasts (seconds, 0 until the style ends)`);
          input.title = "0 lasts until the style ends";
          item.append(duration);
        }

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-effect danger";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${label}`);
        remove.addEventListener("click", () => {
          editing.effects = editing.effects.filter((e) => e.id !== effect.id);
          renderEffects();
          els.effectError.hidden = true;
        });
        item.append(remove);
        return item;
      })
    );
  }

  /** Reads each effect's inputs into the working copy. Returns false if any are invalid. */
  function readEffects() {
    let valid = true;
    editing.effects = editing.effects.map((effect) => {
      const item = els.effectList.querySelector(`[data-effect-id="${CSS.escape(effect.id)}"]`);
      if (!item) return effect;
      const next = { ...effect, enabled: item.querySelector(".effect-enabled").checked };
      for (const [className, key] of [["effect-start", "startSeconds"], ["effect-duration", "durationSeconds"]]) {
        const input = item.querySelector(`.${className}`);
        if (!input) continue;
        const seconds = parseEffectSeconds(input.value);
        input.setAttribute("aria-invalid", seconds === null ? "true" : "false");
        if (seconds === null) valid = false;
        else next[key] = seconds;
      }
      item.classList.toggle("is-disabled", !next.enabled);
      item.querySelector(".effect-name").textContent = describeEffect(next);
      return next;
    });
    return valid;
  }

  els.addEffect.addEventListener("click", () => {
    readEffects();
    editing.effects = [...editing.effects, newEffect(`effect-${crypto.randomUUID()}`, els.effectType.value)];
    renderEffects();
    els.effectList.lastElementChild?.querySelector(".effect-start")?.focus();
  });

  // ---- Editor --------------------------------------------------------------

  function showError(input, errorEl, message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  /** Reads the form into the working copy. Returns error messages by field. */
  function readForm() {
    const errors = {};
    const name = parseStyleName(els.name.value);
    if (name === null) errors.name = "Enter a name (up to 40 characters).";
    else editing.name = name;

    if (editing.start !== null && isStartExpression(els.start.value)) {
      const expression = parseStartExpression(els.start.value);
      const minutes = expression && startMinutes({ start: { expression } }, getDurationMinutes());
      if (expression === null) {
        errors.start = "Use numbers, $duration, + - * /, and parentheses, e.g. $duration / 10.";
      } else if (Number.isNaN(minutes)) {
        errors.start = "That expression has no value with the current duration (dividing by zero?).";
      } else if (Math.abs(minutes) > MAX_START_MINUTES) {
        errors.start = `That's ${Math.round(minutes)} minutes with the current duration; keep it between -1440 and 1440.`;
      } else {
        editing.start = { expression };
      }
    } else if (editing.start !== null) {
      const minutes = parseStartMinutes(els.start.value);
      const plusDuration = els.plusDuration.checked;
      if (minutes === null) {
        errors.start = "Enter a number of minutes between -1440 and 1440.";
      } else if (!plusDuration && minutes === 0) {
        errors.start = "Start before zero (positive) or over time (negative), not at 0.";
      } else {
        editing.start = { minutes, plusDuration };
      }
    }

    editing.background = els.background.value;
    editing.color = els.color.value;
    editing.font = els.font.value;
    editing.weight = Number(els.weight.value);
    editing.sizePercent = Number(els.size.value);
    editing.shadow = els.shadow.checked;
    editing.enabled = els.enabled.checked;
    if (editing.start !== null && !readEffects()) {
      errors.effects = `Enter whole seconds from 0 to ${MAX_EFFECT_SECONDS}.`;
    }
    return errors;
  }

  function updatePreview() {
    readForm();
    applyStyleVars(els.preview, editing);
    const duration = getDurationMinutes();
    const at = startMinutes(editing, duration);
    els.previewClock.textContent = formatClock((Number.isFinite(at) ? at : duration) * 60 * 1000);
    // The checkbox doesn't apply to an expression, which says how it uses the duration.
    els.plusDuration.disabled = isStartExpression(els.start.value);
    els.sizeValue.textContent = `${editing.sizePercent}%`;
    els.startHint.textContent =
      editing.start === null ? "" : `Starts at ${describeStart(editing, duration)} with the current duration.`;
  }

  function openEditor(id) {
    const existing = getStyles().find((style) => style.id === id);
    isNew = !existing;
    editing = structuredClone(existing ?? newCustomStyle(`custom-${crypto.randomUUID()}`));

    els.title.textContent = isNew ? "Add style" : "Edit style";
    els.name.value = editing.name;
    const hasStart = editing.start !== null;
    els.startField.hidden = !hasStart;
    els.fallbackHint.hidden = hasStart;
    // Effects are timed from the start of a style, which the fallback doesn't have.
    els.effectsField.hidden = !hasStart;
    renderEffects();
    if (hasStart && editing.start.expression !== undefined) {
      els.start.value = editing.start.expression;
      els.plusDuration.checked = false;
    } else if (hasStart) {
      els.start.value = String(editing.start.minutes);
      els.plusDuration.checked = editing.start.plusDuration;
    }
    els.background.value = editing.background;
    els.color.value = editing.color;
    els.font.value = editing.font;
    els.weight.value = String(editing.weight);
    els.size.value = String(editing.sizePercent);
    els.shadow.checked = editing.shadow;
    els.enabled.checked = editing.enabled;

    els.deleteButton.disabled = editing.builtIn || isNew;
    els.deleteWrap.title = editing.builtIn ? BUILT_IN_DELETE_TOOLTIP : "";
    els.deleteButton.setAttribute("aria-description", editing.builtIn ? BUILT_IN_DELETE_TOOLTIP : "");
    showError(els.name, els.nameError, "");
    showError(els.start, els.startError, "");
    els.effectError.hidden = true;

    updatePreview();
    els.dialog.showModal();
    els.name.focus();
  }

  els.form.addEventListener("input", (event) => {
    if (event.target === els.name) showError(els.name, els.nameError, "");
    if (event.target === els.start || event.target === els.plusDuration) showError(els.start, els.startError, "");
    updatePreview();
    if (els.effectList.contains(event.target) && !els.effectList.querySelector('[aria-invalid="true"]')) {
      els.effectError.hidden = true;
    }
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const errors = readForm();
    showError(els.name, els.nameError, errors.name ?? "");
    showError(els.start, els.startError, errors.start ?? "");
    els.effectError.textContent = errors.effects ?? "";
    els.effectError.hidden = !errors.effects;
    if (errors.name || errors.start || errors.effects) {
      if (errors.name) els.name.focus();
      else if (errors.start) els.start.focus();
      else els.effectList.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    const styles = getStyles();
    setStyles(isNew ? [...styles, editing] : styles.map((style) => (style.id === editing.id ? editing : style)));
    els.dialog.close();
    renderList();
  });

  els.cancel.addEventListener("click", () => els.dialog.close());

  els.deleteButton.addEventListener("click", () => {
    if (editing.builtIn) return;
    setStyles(getStyles().filter((style) => style.id !== editing.id));
    els.dialog.close();
    renderList();
  });

  els.add.addEventListener("click", () => openEditor(null));

  return { renderList, isOpen: () => els.dialog.open };
}
