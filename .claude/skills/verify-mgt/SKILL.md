---
name: verify-mgt
description: Drive the modernGraphTool web app in a real browser the way a visitor does, and keep screenshots and accessibility snapshots as proof. Use after changing anything a user can see or click (components, stores, services, the graph engine, URL state), when asked to verify, prove or demo a change, or to reproduce a UI bug.
---

# Verify modernGraphTool

`mgt.mjs` starts the app, drives it in Chromium through Playwright, and writes evidence. You write
or reuse a **journey**: a small script of user actions and checks. Unit specs prove a module;
a journey proves the page a visitor gets.

Run every command from the repository root.

## Launch and doctor

There is nothing to start by hand. Each command starts its own Vite dev server on a free port and
stops that one process when it finishes, so two runs never share an instance.

```
node .claude/skills/verify-mgt/mgt.mjs doctor
```

Doctor is read-only. A healthy instance prints `"boots": true`, `"configLoaded": true`,
`"curves": 3` (the shipped `defaults/config.js` opens on one device, two ears, and one target) and
empty `consoleErrors` and `exceptions`. Run it first whenever a journey fails in a way you do not
understand: if doctor fails too, the app does not boot and the journey is not the problem.

The first run after `npm ci` needs the browser once: `npx playwright install chromium`.

## Drive

```
node .claude/skills/verify-mgt/mgt.mjs run .claude/skills/verify-mgt/journeys/select-device.mjs
node .claude/skills/verify-mgt/mgt.mjs run .claude/skills/verify-mgt/journeys/*.mjs --out ./evidence
```

| Option      | Effect                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------- |
| `--out DIR` | Where evidence goes. Default: a new `mgt-verify-*` folder in the OS temp dir             |
| `--mobile`  | 414x896 viewport. The mobile layout starts below 1000px                                  |
| `--headed`  | Show the browser                                                                         |
| `--url URL` | Drive a server that already runs, such as a built `dist/`. Never started or stopped here |

`mgt.mjs` expands `*` itself, so the second line works in PowerShell and cmd too.

The exit code is 0 only if every journey passed. A journey fails on a failed check, a thrown
error, a console error, an uncaught exception, or a response with status 400 or above.

### Writing a journey

Start from the feature file in [features/](features/README.md) that covers what you changed. It
lists the entry points, the accessible names to use, and what proves the feature works. Copy the
nearest file in `journeys/` and change it. A journey for one change can live in your scratch
directory; add it to `journeys/` when it proves a feature the map lists.

```js
export const name = 'select-device'; // also the evidence folder's name
export const allow = ['favicon.ico']; // optional: substrings of errors this journey expects

export default async function ({ page, boot, panel, check, shot, aria }) {
	await boot(); // open '/', wait for the first draw
	await panel('DEVICES'); // 'DEVICES' | 'GRAPH' | 'EQUALIZER' | 'MISC'
	await page.getByRole('button', { name: 'GZR HT5', exact: true }).click();
	check('the page title names the device', (await page.title()).includes('GZR HT5'));
	await shot('added'); // 01-added.png
	await aria('added'); // 02-added.aria.yml, the accessibility tree
}
```

- `page` is a Playwright `Page`. Find elements by role and accessible name, in English: the
  driver pins the locale to `en-US`.
- `boot(path, { firstVisit })` opens `origin + path`. By default the visitor is a returning one,
  with the welcome and equalizer tours already dismissed. Pass `{ firstVisit: true }` to test a
  tour, and expect its dialog to cover the page. The dismissal stays for the rest of the journey,
  so a `firstVisit` boot has to come before any other `boot()`; the driver throws otherwise.
- `check(name, ok, detail)` records a line and lets the journey continue. Wait for a state with a
  locator's `waitFor` or `page.waitForFunction` first, then check it. Never sleep.
- `toolbar()` makes the graph toolbar reachable. On mobile it opens the `GRAPH` panel's
  `Graph Controls` section; on desktop it does nothing.
- `curves()` counts the device and target curves on the graph. A changed count proves little:
  two devices each collapse to one average curve.

## Evidence

Each journey gets a folder under the `--out` directory: numbered screenshots and accessibility
snapshots in the order they were taken, a `crash.png` if it threw, and `report.json` with every
check, console error, exception and failed request. The run prints the folder's path last.

What counts as proof:

- Drive the path a user takes: click, type, press keys. Do not call a store or set state through
  `page.evaluate`.
- Capture the action and the result: a screenshot before and after, not only the final screen.
- Check what the user can observe: the page title, a pressed state, a label on the graph, a
  field's value, the link in the Share dialog.
- A change that touches layout needs `--mobile` as a second run.
- A change that touches the build, boot order, the worker or the security headers needs
  `npm run build && npm run test:smoke` as well. This skill drives the dev server, which has no
  CSP and does not run the bundled output.

## Cleanup

The driver stops the server and the browser it started, on success and on failure, and nothing
else. It never kills by process name. Evidence is never deleted: remove an `--out` folder
yourself once it has been attached or reviewed. If a run was killed from outside, stop the server
by the pid on the `Dev server:` line it printed when it started, and that process only.

## Maintenance

The feature map goes stale when a label, a panel or a default device changes. When a journey
fails because the app changed on purpose, update the feature file and the journey in the same
change as the code. `/pstack:maintain-verification-skill` audits the map against the app.
