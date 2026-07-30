/**
 * Pin the UI language for component tests.
 *
 * Chromium inherits the host machine's system locale, and Paraglide's
 * `preferredLanguage` strategy follows it — so on a Korean Windows machine
 * `navigator.language` is `ko` and the entire UI renders in Korean. Every spec
 * that queries an English string ("L", "Pick color", "Random", …) then matches
 * nothing and burns its full retry timeout before failing: ~34 failures and
 * ~200s of wall time. CI runs en-US, so it never saw this.
 *
 * Written straight to `localStorage`, which is first in the configured strategy
 * order, rather than through the two obvious alternatives:
 *
 * - Playwright's `context.locale` does not reach the page in browser mode —
 *   `navigator.language` stays on the system locale.
 * - Calling `setLocale()` from `$lib/paraglide/runtime.js` works, but importing
 *   that module *here* caches the real one before a spec's `vi.mock` can
 *   intercept it, which breaks MiscPanel's mocked `setLocale`. A setup file
 *   shares a module registry with the test file it precedes.
 *
 * Key and value are literals for the same reason. They must track
 * `localStorageKey` and `baseLocale` in `src/lib/paraglide/runtime.js`, which
 * are generated from `project.inlang/settings.json`.
 */
localStorage.setItem('PARAGLIDE_LOCALE', 'en');
