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
