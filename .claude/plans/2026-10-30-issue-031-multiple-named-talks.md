# Issue #31: Support multiple named scheduled talks

https://github.com/ardalis/scheduled-timer/issues/31

> Instead of just one, support multiple scheduled talks, each with its own duration.
> Support giving each a name.
> Don't allow overlapping schedules.

## Assumptions

The issue is short, so these decisions are ours and should be easy to challenge in review:

- **Schedule adds a talk.** It no longer replaces the pending schedule. To reschedule, remove the talk and add it again.
- **Name and duration are optional.** A blank duration follows the presentation duration in configuration, so scheduling and then changing the duration in configuration keeps working. A blank name keeps today's wording.
- **Overlap means the planned time ranges intersect**, `[start, start + duration)`. One talk may start the moment another ends. Overtime isn't counted.
- **A later talk's start always wins.** If the previous talk is over time or paused, the next talk still starts on time, because starting on time is the point of this app.
- **Changing the presentation duration is rejected** if it would make talks that follow it overlap.
- **Times stay "next occurrence within 24 hours".** Scheduling further ahead (e.g. a multi-day conference) is out of scope; #32 may need it.
- **Storage:** the list lives in `localStorage` under its own key, and the `scheduledStart` cookie keeps mirroring the current talk. If storage is blocked, the current talk still survives a reload, and the user is warned that the rest won't.

## Phase 1: Talk logic

- [x] Add `public/talks-core.js`: normalize, load and save, sort, resolve duration, find overlaps, find the talk that is due, prune finished talks
- [x] Add an optional name to `scheduleSummary`
- [x] Unit tests in `tests/unit/talks-core.test.js` and `tests/unit/timer-core.test.js`

## Phase 2: App behavior

- [x] Track the current talk and the list in `app.js`; arm the next talk when one ends, is reset, or is removed
- [x] Start a due talk from any mode, including running, paused, and over time
- [x] Add name and duration fields, an overlap error, and a list of upcoming talks with Remove buttons
- [x] Show the talk's name in the status line and summary
- [x] Reject a presentation duration that would cause an overlap
- [x] Restore the list on load, merging a cookie-only schedule

## Phase 3: End-to-end tests

- [x] New `tests/e2e/talks.spec.js`: adding, names, own durations, overlap rejection, adjacent talks, moving between talks, overrun, pause, reset, remove, reload, blocked storage, HTML in names, config conflicts
- [x] Replace the "rescheduling replaces" test with the new behavior

## Phase 4: Docs

- [x] Update the README features and test sections

## Phase 5: Independent review

- [x] Review the full change set with a separate agent, including security, performance, and accessibility
- [x] Address all significant findings, and record the reason for any left unaddressed

## Phase 6: Verification

- [x] `npm test` passes (unit, e2e, coverage). This repo has no .NET projects, so the default `dotnet` verify command doesn't apply.

## Review outcome

Addressed: overlap bypass after pause, resume, or Start now; stale tabs overwriting the list (tabs now sync through `storage` events); a stale duration after a talk stops; "Cancel schedule" relabelled and double clicks ignored; keyboard Remove no longer lands on another Remove button; the config overlap check compares against the duration in use; a new talk is only compared with talks it could overlap; the error clears on removal and suggests a fix; `aria-invalid` on the duration; scheduling while a timer runs is documented; test gaps filled. The list is also collapsed behind a toggle, after screenshots showed it covering the clock.

Deliberately not addressed:

- **Blocked storage loses a talk's name and own duration on reload.** The cookie holds only the start time. This is rare, since browsers that block storage often block cookies too. The warning now says talks may be lost on reload.
- **Stored talks aren't re-validated for overlaps on load.** The app's own paths can no longer create overlaps, and bad stored data no longer blocks adding talks.
- **A timer started by hand, with no talk, isn't protected from a talk's start.** A talk's start takes over from it, as intended.
