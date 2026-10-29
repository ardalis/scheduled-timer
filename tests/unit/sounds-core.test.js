import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LATE_SOUND_MS, NO_SOUND, SOUNDS, defaultSounds, isTimely, normalizeSounds, soundFile } from "../../public/sounds-core.js";

describe("sounds", () => {
  it("defaults to the bell at the start and the alert at the end", () => {
    assert.deepEqual(defaultSounds(), { start: "trolleybus-bell", end: "alert-asterisk" });
  });

  it("points at sound files that exist under public/", () => {
    for (const { file } of Object.values(SOUNDS)) {
      assert.ok(existsSync(join(process.cwd(), "public", file)), file);
    }
    assert.equal(soundFile("alert-asterisk"), SOUNDS["alert-asterisk"].file);
    assert.equal(soundFile(NO_SOUND), null);
    assert.equal(soundFile("toString"), null);
  });

  it("keeps valid choices, including none, and falls back otherwise", () => {
    assert.deepEqual(normalizeSounds({ start: NO_SOUND, end: "trolleybus-bell" }), { start: NO_SOUND, end: "trolleybus-bell" });
    assert.deepEqual(normalizeSounds({ start: "kazoo", end: 3, extra: "x" }), defaultSounds());
    assert.deepEqual(normalizeSounds(null), defaultSounds());
    assert.deepEqual(normalizeSounds({ start: "alert-asterisk" }), { start: "alert-asterisk", end: "alert-asterisk" });
  });

  it("plays only for moments that just happened", () => {
    assert.equal(isTimely(0), true);
    assert.equal(isTimely(LATE_SOUND_MS), true);
    assert.equal(isTimely(LATE_SOUND_MS + 1), false);
    assert.equal(isTimely(-1), false);
  });
});
