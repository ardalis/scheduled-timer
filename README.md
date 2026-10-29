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

- Full-screen countdown in a large font (defaults to 5 minutes), shown as `mm:ss`, or `hh:mm:ss` for an hour or more.
- At zero it keeps counting over time as a negative number (`-00:01`, `-00:02`, …), and stops once it's an hour over.
- Styles set the background, text color, font, size, and shadow for each stage of the countdown. Built in: **Inactive** (muted grey, whenever no other style applies), **Starting Soon** (blue, handwritten, from 5 minutes before the start), **Active** (green, bold, from the start), and **Overtime** (red, Bangers, from zero to an hour over). Built-in styles can be edited or disabled; custom styles can be added and deleted. Each style starts a number of minutes from zero, and the closest to zero applies. A start can also be an expression of the presentation duration, such as `$duration / 10` or `$duration - 5`, so styles adapt to talks of any length.
- Effects play within a style, starting a number of seconds after it begins. **Strobe** inverts the screen colors every half second; by default, Overtime strobes for 5 seconds when time runs out (it can be disabled or removed). **Fade to next style** gradually blends the colors and size into the next style, so it matches by the time that style takes over. Effects play only while the timer is running or counting toward a scheduled start.
- Themes are named sets of styles. Save the current styles as a theme, switch between saved themes (or back to Default) in configuration, and export or import themes as JSON files to share them.
- Configuration (the gear icon, top right) sets the timer duration to any number of minutes. Settings are saved in browser storage (`localStorage`).
- Pick a start time; it's scheduled for the next occurrence of that local time within 24 hours.
- Before the start, shows "Timer will begin in (timespan)." in natural units.
- The scheduled start is stored in a cookie, so reloading the page keeps (or resumes) the timer.
- Start/pause/reset manually. Reset takes a second click within 4 seconds, so it's hard to hit by accident. `F` toggles full screen.
- Safe with a presentation remote: by default no key changes the timer, and clicking a control doesn't leave it focused, so keys a remote sends to this window (Page Down, arrows, Enter, Space, B) can't start, pause, reset, or reschedule it. `Space` to start and pause can be turned on in configuration.
- Controls and cursor hide while the timer is running and the mouse is idle.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or later, with npm
- A [Cloudflare](https://dash.cloudflare.com/sign-up) account, to deploy

## Build

There is no build step. The app is plain HTML, CSS, and JavaScript in `public/`, and that folder is deployed as-is.

Install the development tools (Wrangler, Playwright, c8) once after cloning:

```sh
npm install
```

## Run locally

```sh
npm run dev
```

This serves `public/` with Wrangler's local Cloudflare Pages runtime at <http://localhost:8788>, including the headers in `public/_headers`.

`npm run serve` is a lighter alternative (the static server the tests use) at <http://127.0.0.1:4173>. Any static file server works, e.g. `python3 -m http.server -d public`. Opening `index.html` directly from disk does not work, because browsers block ES modules on `file://` pages.

## Test

```sh
npx playwright install chromium   # once; add --with-deps on a fresh Linux machine
npm test
```

`npm test` runs, in order:

- **Unit tests** (`npm run test:unit`): Node's built-in test runner against the pure logic in `public/timer-core.js` (scheduling, including daylight saving transitions, formatting, input parsing, and restoring a saved schedule) the configuration storage in `public/config.js`, choosing styles and evaluating start expressions in `public/styles-core.js`, timing effects in `public/effects-core.js`, and saving, importing, and exporting themes in `public/themes-core.js`. Prints unit coverage.
- **End-to-end tests** (`npm run test:e2e`): Playwright drives the app in Chromium with a fake clock in the `America/New_York` time zone, covering the timer, scheduling, the cookie, configuration, styles, effects, themes, reloads, keyboard shortcuts, and auto-hiding controls.
- **Coverage** (`npm run coverage`): merges V8 coverage from both suites and prints a combined report for `public/`. HTML and `lcov.info` reports are written to `coverage/`.

Each step can also be run on its own. CI runs `npm test` on every push to `main` and on pull requests.

## Deploy to Cloudflare Pages

The site is a Cloudflare Pages project. `wrangler.toml` sets the project name (`scheduled-timer`) and the folder to publish (`public`).

### From your machine with Wrangler

```sh
npx wrangler login                                                          # once: opens a browser to sign in
npx wrangler pages project create scheduled-timer --production-branch main  # once per Cloudflare account
npm run deploy
```

`npm run deploy` runs `wrangler pages deploy` and prints the deployment URL. Wrangler uses the current Git branch: deploying from `main` updates production at `https://scheduled-timer.pages.dev`, and deploying from any other branch creates a preview deployment with its own URL. To pick the branch explicitly:

```sh
npx wrangler pages deploy --branch main         # production
npx wrangler pages deploy --branch my-feature   # preview
```

If the project name is already taken in your account, change `name` in `wrangler.toml` to match the project you created.

### Automatically from GitHub

To have Cloudflare deploy on every push instead:

1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, and choose this repository.
2. Set the production branch to `main`, the framework preset to **None**, leave the build command empty, and set the build output directory to `public`.
3. Save and deploy.

Pushes to `main` then deploy to production, and other branches and pull requests get preview URLs.

To deploy from a CI job instead, create a Cloudflare API token with the **Cloudflare Pages: Edit** permission, set the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables, and run `npm run deploy`.
