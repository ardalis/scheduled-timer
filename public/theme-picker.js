// The theme controls in the configuration dialog: choose, save, delete,
// export, and import themes. Like the style editor, changes go to the
// configuration dialog's draft, which Save writes to storage.

import {
  DEFAULT_THEME_ID,
  allThemes,
  deleteTheme,
  findTheme,
  isReservedThemeName,
  parseThemeJson,
  saveTheme,
  stylesMatch,
  themeFileName,
  themeToJson,
} from "./themes-core.js";

const CUSTOM_VALUE = "";

/**
 * @param {object} options
 * @param {() => object} options.getDraft  the draft config (styles, themes, themeId)
 * @param {(styles: object[]) => void} options.applyStyles  replaces the draft styles and redraws them
 */
export function setupThemePicker({ getDraft, applyStyles }) {
  const $ = (id) => document.getElementById(id);
  const els = {
    select: $("theme-select"),
    deleteButton: $("theme-delete"),
    name: $("theme-name"),
    save: $("theme-save"),
    exportButton: $("theme-export"),
    importButton: $("theme-import"),
    file: $("theme-import-file"),
    status: $("theme-status"),
    error: $("theme-error"),
  };

  function showStatus(message) {
    els.status.textContent = message;
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = !message;
    els.name.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function current() {
    const draft = getDraft();
    return draft.themeId === null ? null : findTheme(draft.themes, draft.themeId);
  }

  /** Redraws the controls from the draft. */
  function render() {
    const draft = getDraft();
    const selected = current();
    const modified = selected && !stylesMatch(selected.styles, draft.styles);
    const options = allThemes(draft.themes).map((theme) => {
      const label = theme.id === selected?.id && modified ? `${theme.name} (modified)` : theme.name;
      return new Option(label, theme.id);
    });
    if (!selected) options.unshift(new Option("Custom styles", CUSTOM_VALUE));
    els.select.replaceChildren(...options);
    els.select.value = selected?.id ?? CUSTOM_VALUE;
    els.deleteButton.disabled = !selected || selected.id === DEFAULT_THEME_ID;
    els.deleteButton.title = selected?.id === DEFAULT_THEME_ID ? "The Default theme cannot be deleted." : "";
  }

  /** Resets the controls when the configuration dialog opens. */
  function reset() {
    const selected = current();
    els.name.value = selected && selected.id !== DEFAULT_THEME_ID ? selected.name : "";
    showStatus("");
    showError("");
    render();
  }

  function choose(theme) {
    const draft = getDraft();
    draft.themeId = theme.id;
    applyStyles(structuredClone(theme.styles));
    els.name.value = theme.id === DEFAULT_THEME_ID ? "" : theme.name;
    render();
  }

  els.select.addEventListener("change", () => {
    const theme = findTheme(getDraft().themes, els.select.value);
    if (!theme) return;
    showError("");
    choose(theme);
    showStatus(`Switched to “${theme.name}”.`);
  });

  /**
   * Adds or replaces a saved theme, then selects it. Returns { theme, replaced },
   * or null (showing why) if it can't be saved.
   */
  function store(name, styles) {
    const draft = getDraft();
    const result = saveTheme(draft.themes, name, styles, `theme-${crypto.randomUUID()}`);
    if (result.error) {
      showStatus("");
      showError(result.error);
      return null;
    }
    showError("");
    const replaced = result.themes.length === draft.themes.length;
    draft.themes = result.themes;
    choose(result.theme);
    return { theme: result.theme, replaced };
  }

  els.save.addEventListener("click", () => {
    const saved = store(els.name.value, getDraft().styles);
    if (saved) showStatus(`${saved.replaced ? "Updated" : "Saved"} theme “${saved.theme.name}”.`);
    else els.name.focus();
  });

  els.name.addEventListener("input", () => showError(""));
  els.name.addEventListener("keydown", (event) => {
    // Enter saves the theme rather than submitting the whole dialog.
    if (event.key === "Enter") {
      event.preventDefault();
      els.save.click();
    }
  });

  els.deleteButton.addEventListener("click", () => {
    const selected = current();
    if (!selected || selected.id === DEFAULT_THEME_ID) return;
    const draft = getDraft();
    draft.themes = deleteTheme(draft.themes, selected.id);
    // The styles stay as they are, just no longer tied to a theme.
    draft.themeId = null;
    els.name.value = "";
    render();
    showStatus(`Deleted theme “${selected.name}”.`);
  });

  els.exportButton.addEventListener("click", () => {
    const name = els.name.value.trim() || current()?.name || "My theme";
    const blob = new Blob([themeToJson(name, getDraft().styles)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = themeFileName(name);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showStatus(`Exported “${name}”.`);
  });

  els.importButton.addEventListener("click", () => els.file.click());

  els.file.addEventListener("change", async () => {
    const [file] = els.file.files;
    els.file.value = "";
    if (!file) return;
    const parsed = parseThemeJson(await file.text());
    if (parsed.error) {
      showStatus("");
      showError(parsed.error);
      return;
    }
    const name = isReservedThemeName(parsed.name) ? `${parsed.name} (imported)` : parsed.name;
    const saved = store(name, parsed.styles);
    if (saved) showStatus(`${saved.replaced ? "Replaced" : "Imported"} theme “${saved.theme.name}”.`);
  });

  return { render, reset };
}
