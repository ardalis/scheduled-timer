// Shared Playwright fixtures: V8 coverage collection plus helpers for driving
// the timer against a fake clock.
import { test as base, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const publicDir = join(process.cwd(), "public");
const coverageDir = join(process.cwd(), "coverage", ".v8", "e2e");

/** 10:00 on a weekday in America/New_York (the configured browser time zone). */
export const MORNING = new Date("2026-10-28T10:00:00-04:00");

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    const entries = await page.coverage.stopJSCoverage();

    // Rewrite served URLs to file paths so c8 can map them back to public/.
    const result = entries
      .filter((entry) => /^http:\/\/127\.0\.0\.1:\d+\//.test(entry.url))
      .map(({ source, ...entry }) => {
        const pathname = new URL(entry.url).pathname;
        return { ...entry, url: pathToFileURL(join(publicDir, pathname)).href };
      });
    if (result.length) {
      mkdirSync(coverageDir, { recursive: true });
      writeFileSync(join(coverageDir, `coverage-${randomUUID()}.json`), JSON.stringify({ result }));
    }
  },

  timer: async ({ page }, use) => {
    await use(new TimerPage(page));
  },
});

export { expect };

export class TimerPage {
  constructor(page) {
    this.page = page;
    this.display = page.locator("#display");
    this.status = page.locator("#status");
    this.startTime = page.locator("#start-time");
    this.scheduleButton = page.getByRole("button", { name: "Schedule", exact: true });
    this.cancelSchedule = page.getByRole("button", { name: "Cancel schedule" });
    this.configButton = page.getByRole("button", { name: "Configuration" });
    this.configDialog = page.locator("#config-dialog");
    this.configDuration = page.getByLabel("Presentation duration (minutes)");
    this.configSave = this.configDialog.getByRole("button", { name: "Save", exact: true });
    this.configCancel = this.configDialog.getByRole("button", { name: "Cancel", exact: true });
    this.themeSelect = page.getByRole("combobox", { name: "Theme", exact: true });
    this.themeName = page.getByRole("textbox", { name: "Theme name" });
    this.themeSave = page.getByRole("button", { name: "Save as theme" });
    this.themeDelete = page.getByRole("button", { name: "Delete theme" });
    this.themeExport = page.getByRole("button", { name: "Export theme" });
    this.themeImport = page.getByRole("button", { name: "Import theme" });
    this.themeFile = page.locator("#theme-import-file");
    this.themeStatus = page.locator("#theme-status");
    this.themeError = page.locator("#theme-error");
    this.styleList = page.locator("#style-list");
    this.effectList = page.locator("#effect-list");
    this.addStyle = page.getByRole("button", { name: "Add style" });
    this.styleDialog = page.locator("#style-dialog");
    this.stylePreview = page.locator("#style-preview");
    this.styleName = this.styleDialog.getByLabel("Name");
    this.styleStart = this.styleDialog.getByLabel("Starts at (minutes from zero)");
    this.stylePlusDuration = this.styleDialog.getByLabel("plus the presentation duration");
    this.styleBackground = this.styleDialog.getByLabel("Background");
    this.styleColor = this.styleDialog.getByLabel("Text color");
    this.styleFont = this.styleDialog.getByLabel("Font");
    this.styleWeight = this.styleDialog.getByLabel("Weight");
    this.styleSize = this.styleDialog.getByLabel(/^Size/);
    this.styleShadow = this.styleDialog.getByLabel("Text shadow");
    this.styleEnabled = this.styleDialog.getByLabel("Enabled");
    this.styleDelete = this.styleDialog.getByRole("button", { name: "Delete" });
    this.styleDone = this.styleDialog.getByRole("button", { name: "Done" });
    this.styleCancel = this.styleDialog.getByRole("button", { name: "Cancel" });
    this.startPause = page.locator("#start-pause");
    this.reset = page.locator("#reset");
    this.configKeyboard = page.getByLabel("Space starts and pauses the timer");
    this.fullscreen = page.locator("#fullscreen");
    this.controls = page.locator("#controls");
  }

  /** Installs a paused fake clock at `time`, then loads the app. */
  async open(time = MORNING) {
    // Install a minute early: the clock runs until paused, and pausing at a
    // time it has already passed throws.
    await this.page.clock.install({ time: new Date(time.getTime() - MINUTE) });
    // Paused, so time only moves when a test advances it (including across reloads).
    await this.page.clock.pauseAt(time);
    await this.page.goto("/");
    await expect(this.page.locator("body")).toHaveAttribute("data-state", /.+/);
  }

  async expectState(state) {
    await expect(this.page.locator("body")).toHaveAttribute("data-state", state);
  }

  async scheduleAt(hhmm) {
    await this.startTime.fill(hhmm);
    await this.click(this.scheduleButton);
  }

  async openConfig() {
    await this.click(this.configButton);
    await expect(this.configDialog).toBeVisible();
  }

  /** Sets the presentation duration through the configuration dialog. */
  async setMinutes(minutes) {
    await this.openConfig();
    await this.configDuration.fill(String(minutes));
    await this.configSave.click();
    await expect(this.configDialog).toBeHidden();
  }

  /** The row in the style list for a style. */
  styleRow(name) {
    return this.configDialog.getByRole("button", { name: `Edit ${name}`, exact: true });
  }

  styleToggle(name) {
    return this.configDialog.getByRole("checkbox", { name: `Enable ${name}`, exact: true });
  }

  async editStyle(name) {
    await this.styleRow(name).click();
    await expect(this.styleDialog).toBeVisible();
  }

  /** Names in the style list, top to bottom. */
  async styleNames() {
    return this.styleList.locator(".style-name").allTextContents();
  }

  async saveConfig() {
    await this.configSave.click();
    await expect(this.configDialog).toBeHidden();
  }

  /** The id of the style currently applied to the page ("" for none). */
  async currentStyle() {
    return this.page.locator("body").getAttribute("data-style");
  }

  async expectStyle(id) {
    await expect(this.page.locator("body")).toHaveAttribute("data-style", id);
  }

  async background() {
    return this.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  }

  async storedConfig() {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem("scheduled-timer:config")));
  }

  /** Writes config straight to storage, as a previous visit would have. */
  async storeConfig(config) {
    await this.page.evaluate((value) => localStorage.setItem("scheduled-timer:config", JSON.stringify(value)), config);
  }

  /** Advances the fake clock, firing every timer along the way. */
  async advance(ms) {
    await this.page.clock.runFor(ms);
  }

  /**
   * Jumps the fake clock ahead, firing due timers once (like a throttled
   * background tab). The app derives everything from Date.now(), so this is
   * equivalent to advance() for long spans, and much faster.
   */
  async jump(ms) {
    await this.page.clock.fastForward(ms);
  }

  /**
   * Clicks a control the way a person would: moving the mouse first, which
   * reveals the controls if they auto-hid while the timer was running.
   */
  async click(locator) {
    await this.page.mouse.move(5, 5);
    await this.page.mouse.move(10, 10);
    await locator.click();
  }

  /** Resets the timer, which takes two clicks. */
  async resetTimer() {
    await this.click(this.reset);
    await expect(this.reset).toHaveText("Confirm reset");
    await this.click(this.reset);
    await expect(this.reset).toHaveText("Reset");
  }

  /** Turns on Space to start and pause, which is off by default. */
  async enableKeyboardControl() {
    await this.openConfig();
    await this.configKeyboard.check();
    await this.saveConfig();
  }

  async cookie(name) {
    const cookies = await this.page.context().cookies();
    return cookies.find((cookie) => cookie.name === name) ?? null;
  }
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
