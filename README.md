# scheduled-timer

A speaker tool that starts a configured countdown timer at a specific time.

## The Problem

You're about to go on stage to give a presentation. You have a specific time you're trying to hit.

You set up a timer on your phone. It goes to sleep to conserve battery.

You set up a timer on your PC. You forget to start it.

You remembered to start the timer on your PC. Your slide clicker's first click was interpreted as "stop timer".

## The Goal

Most apps like the built-in timers and alarms on a phone support *either* scheduling a thing to make noise at a time **or** starting something counting down when you tell it to do so. What's needed for most conference talks is something that starts counting down **at a specific time** whether you remember to tell it to or not.

## Features

- Full-screen `mm:ss` countdown in a large font (defaults to 5 minutes).
- Pick a start time; it's scheduled for the next occurrence of that local time within 24 hours.
- Before the start, shows "Timer will begin in (timespan)." in natural units.
- The scheduled start is stored in a cookie, so reloading the page keeps (or resumes) the timer.
- Start/pause/reset manually; `Space` toggles start/pause, `F` toggles full screen.
- Controls and cursor hide while the timer is running and the mouse is idle.

## Development

The site is static files in `public/`, deployed as a Cloudflare Pages project.

```sh
npm install
npm run dev     # wrangler pages dev on http://localhost:8788
npm run deploy  # wrangler pages deploy
```

Any static file server works too, e.g. `python3 -m http.server -d public`.

## Testing

```sh
npm install
npx playwright install chromium   # once; add --with-deps on a fresh Linux machine
npm test
```

`npm test` runs, in order:

- **Unit tests** (`npm run test:unit`): Node's built-in test runner against the pure logic in `public/timer-core.js` (scheduling, including daylight saving transitions, formatting, input parsing, and restoring a saved schedule). Prints unit coverage.
- **End-to-end tests** (`npm run test:e2e`): Playwright drives the app in Chromium with a fake clock in the `America/New_York` time zone, covering the timer, scheduling, the cookie, reloads, keyboard shortcuts, and auto-hiding controls.
- **Coverage** (`npm run coverage`): merges V8 coverage from both suites and prints a combined report for `public/`. HTML and `lcov.info` reports are written to `coverage/`.

Each step can also be run on its own. CI runs `npm test` on every push to `main` and on pull requests.
