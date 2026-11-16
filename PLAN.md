# Web audit plan (temporary)

Working checklist from the modern-web-guidance audit of 2026-11-16. Delete this file before the
branch merges.

You should act as a orchestrator, and advisor. Delegate small, independent jobs to Sonnet subagent if possible.

## How to use this file

Each item has an ID, a location, the problem, the proposed fix and a rough effort (S / M / L).
Before changing anything for an item, **verify it**: read the code at the location, and for
anything visual or behavioural, reproduce it in a browser. Then tick the box, or strike the item
with a one-line reason if it turns out to be wrong.

How far each item has been checked so far:

- **[checked]** means the claim was re-read against the code after the audit.
- Everything else was found by one auditor reading the code. Nothing in this file was tested in a
  browser, with a screen reader, or with the performance harness.
- Every expected gain in the Performance section is a hypothesis until measured.

Guide names in `code font` are modern-web-guidance guide ids; fetch one with
`npx -y modern-web-guidance@latest retrieve "<id>"`.

## Decisions already made

- **Keep `maximum-scale=1.0` on iOS** (`AppShell.svelte:56-68`). 16px inputs are not affordable
  now. No action.
- **Palette change is approved** (item T3).
- **Skip the graph text alternative** (hidden summary or data table for the curves). Not planned.
- The automated `legacy-scan` of `src` found nothing (0 findings, 35 rules), so there is no
  legacy-pattern work.

## Progress log

- **2026-11-16, section 1 (B1–B9, plus F1, F7, F8):** every claim held against the code. Fixed,
  `npm run check` / `lint` / `test` green (2630 tests). In a browser (Playwright, dev server):
  B4 Enter/Space/click step once and hold repeats then stops on release; F8 commits on blur and
  restores on empty; B5 gives `lang="ko"` on a Korean browser; B6 Enter on a link opens the site.
  B1, B2, B3, B7, B8, B9 are covered by specs only. Not committed yet.
- New helpers: `utils/number-field.ts` (`parseBounded`), `utils/ime.ts` (`isImeComposing`),
  `utils/document-locale.ts`, `utils/eq-filter-parse.ts` (`parseFilter`, moved out of the bookmark
  store), `sanitizeHttpUrl` in `utils/html-sanitizer.ts`.

## Found while fixing (new items)

- [ ] **N1. Holding a Y-offset +/- button records one undo entry per tick** (S–M)
  - Where: `controls/SelectionList.svelte` (`stepYOffset`); `services/command-history.svelte.ts`
  - Problem: about 20 entries for a three-second hold. `CommandHistory` has no merge or amend.
  - Fix: a coalescing window keyed by uuid, or an amend API on `CommandHistory`.
- [ ] **N2. Site switcher is Tab-only through about 150 links** (S)
  - Where: `controls/SiteSelector.svelte`
  - Problem: after B6 the list is plain links with no arrow keys or typeahead; Escape closes it,
    but reaching a site near the end takes many Tab presses.
  - Fix: arrow / Home / End roving over the links, or a filter field at the top.
- [ ] **N3. `PopoverPanel` content is an unnamed dialog** (S)
  - Where: `atoms/PopoverPanel.svelte` (SiteSelector, TopNavBar "More")
  - Fix: an optional `label` prop forwarded as `aria-label`. Fits with O1.
- [ ] **N4. AutoEQ hydrate does not clamp stored numbers to the field range** (S, low value)
  - Where: `stores/settings-store.svelte.ts` (`sanitizeAutoEqOptions`). Type and pair order are
    fixed; an old out-of-range number survives until the field is edited.

## 1. Confirmed bugs (start here)

- [x] **B1. AutoEQ gain fields persist `NaN`** [checked] (S)
  - Where: `src/lib/components/equalizer/EqAutoEq.svelte:164-167, 176-179`
  - Problem: `parseFloat(value) ?? old` never falls back, because `NaN` is not nullish. Clearing
    the field or typing a lone `-` writes `NaN` to `settingsStore.autoEqOptions.gainMin/gainMax`.
    It is then persisted as `null` and spread over the defaults on the next load
    (`settings-store.svelte.ts:96`), and fed to `Math.max/min` in `autoeq-service.svelte.ts:157-158`.
  - Fix: commit on `change` (as `EqAudioPlayer` does), guard with `Number.isFinite`, clamp to
    min/max, keep min ≤ max. Sanitise on hydrate too.
- [x] **B2. Remote index URLs reach `href` with no scheme check** [checked] (S)
  - Where: `src/lib/services/aggregate-index-core.ts:221` (rendered at
    `controls/CrossSiteSearchResults.svelte:116`); `src/lib/services/site-index-core.ts:122-129`
    (rendered at `controls/SiteSelector.svelte:83`)
  - Problem: `db.url` comes from other people's GitHub Pages and is only checked for being a
    non-empty string. An entry with a `javascript:` URL would run script on click, in every
    deployment's origin.
  - Fix: pass `db.url` through `sanitizeUrl`, or `new URL()` with an http/https protocol check, in
    `buildSearchRows` and `buildSiteEntries`; drop entries that fail. Add a spec.
  - Guide: `validate-origins`, `trusted-types`.
- [x] **B3. `reviewLink` and `shopLink` skip the URL check that `links[]` gets** [checked] (S)
  - Where: `src/lib/utils/metadata-parser.ts:237-238`; bound to `href` at
    `controls/PhoneSelector.svelte:447, 458`
  - Problem: `PATH.PHONE_BOOK` can point at a remote or mirrored book, so these are not purely
    operator-trusted.
  - Fix: `sanitizeUrl()` both fields in `_fetchBookObject`, drop on null. Coerce `price` and
    `reviewScore` to string or number.
- [x] **B4. Y-offset +/- buttons do nothing from the keyboard** [checked] (S)
  - Where: `src/lib/components/controls/SelectionList.svelte:341-351, 364-374`; handler `:48-68`
  - Problem: only `onmousedown` / `onmouseup` / `onmouseleave`, no `onclick`. Touch gets one step
    and no hold-to-repeat.
  - Fix: pointer events (`onpointerdown` with `setPointerCapture`, `onpointerup`,
    `onpointercancel`, `onlostpointercapture`) for the repeat, plus an `onclick` that steps once
    when `event.detail === 0` (keyboard activation).
  - Guide: `drag`, `natural-interactions`.
- [x] **B5. `<html lang>` is never updated at runtime** [checked] (S)
  - Where: `src/app.html:3`, `src/hooks.server.ts:10-13` (build-time only);
    `cdn/cdn-index.html:26` and `site-template/index.html:16` (hard-coded `en`)
  - Problem: the locale is resolved client-side, but nothing sets
    `document.documentElement.lang` or `dir`, so a non-English UI is announced with English
    pronunciation rules. It may also affect decimal-separator parsing in Firefox number inputs.
  - Fix: set `lang` and `dir` from `getLocale()` in `hooks.client.ts` or `AppShell.onMount`, and
    again when the locale changes.
- [x] **B6. Site switcher does nothing on Enter or Space** (S–M)
  - Where: `src/lib/components/controls/SiteSelector.svelte:51, 79-94`
  - Problem: a bits-ui `Select` whose items are `<a target="_blank">`. Keyboard activation calls
    `toggleItem()`, which never follows the link. The anchors are also exposed as `role="option"`.
  - Fix: rebuild as a `PopoverPanel` of plain links (like the TopNavBar "More" popover) or a
    `DropdownMenu` with `<a>` items. Minimal fix: `onValueChange` calling
    `window.open(url, '_blank', 'noopener')`.
  - Guide: `menu`.
- [x] **B7. Bookmark rename commits or cancels mid-composition** (S)
  - Where: `src/lib/components/equalizer/EqHistoryAndCompare.svelte:149-159`
  - Problem: Enter saves and Escape cancels with no composition check, which breaks Korean IME
    input.
  - Fix: `if (e.isComposing || e.keyCode === 229) return;` at the top of the handler. The
    `keyCode` check is required for Safari.
  - Guide: `ime-safe-enter-submit`.
- [x] **B8. `?state=` is applied without shape validation** (S)
  - Where: `src/lib/utils/url-state.ts:102-113`; `src/lib/utils/url-provider.ts:111, 121, 138-147`
  - Problem: `eq: {}` makes `eq.filters.length` throw inside `applyStateFromURL`, uncaught at
    `services/initial-load.ts:98`. Thousands of filters or non-numeric values land in `eqStore`.
    A phone named `constructor` matches `key in yOffsets`.
  - Fix: reuse `parseFilter` from `stores/eq-bookmark-store.svelte.ts:177-204`, cap the filter
    count (32), require finite numbers for `yScale`, `preamp` and offsets, use `Object.hasOwn`,
    wrap the call in try/catch.
- [x] **B9. Hard-coded `text-white` on accent fails contrast in dark mode** (S)
  - Where: `src/lib/components/equalizer/EqFilterCard.svelte:459, 481`
  - Problem: white on dark-mode accent computes to 2.41:1.
  - Fix: `text-accent-content` (8.21 dark / 7.36 light). See also T4.

## 2. Accessibility

- [ ] **A1. Links nested inside the device row `<button>`** (M)
  - Where: `src/lib/components/controls/PhoneSelector.svelte:392-481` (anchors at 423, 446, 457, 470)
  - Problem: invalid interactive nesting; the rank, review and shop links are not exposed as
    links. Line 394 disables the button while loading, which disables everything inside it.
  - Fix: make the row a container with the toggle button and the link row as siblings; keep the
    full-row hit area with a stretched `::after` on the button.
- [ ] **A2. Selected and expanded states are conveyed by colour only** (M)
  - Where: `PhoneSelector.svelte:354` (brand filter), `:392` (device loaded);
    `SelectionList.svelte:186` (current variant), `:249` (baseline: name changes instead of a
    state); `EqFilterCard.svelte:455, 477` (type and channel segments), `:404` (expander);
    `NormalizerInput.svelte:25-38` (Avg/Hz); `TutorialModal.svelte:269` (step dot)
  - Fix: `aria-pressed` on toggles, `aria-expanded` on the expander, `aria-current="step"` on the
    dot. Replace the two EqFilterCard groups and Avg/Hz with the `SegmentedControl` atom.
- [ ] **A3. Form controls with no accessible name** (S)
  - Where:
    - `panels/MiscPanel.svelte:59` (language select)
    - `controls/NormalizerInput.svelte:42` (Hz input)
    - `equalizer/EqFilterCard.svelte:263` (band Switch), `:296-399` and `:497-587` (number
      fields named only "Hz" / "dB" / "Q"), `:512, 553, 589` (range sliders)
    - `equalizer/EqAutoEq.svelte:127-212` (six Min/Max fields beside plain `<span>`s)
    - `equalizer/EqAudioPlayer.svelte:185-197` (source select), `:207-218` (tone), `:316-325`
      (seek), `:364-373` (volume)
    - `features/TargetCustomizer.svelte:173, 186` (selects named by placeholder option)
    - `equalizer/EqSettings.svelte:26` (select beside a `<span>`), `:50-54` (Switch)
    - `features/GraphColorPicker.svelte:148-154` (colour input)
    - `controls/PhoneSelector.svelte:244` (search input, placeholder only)
  - Fix: `aria-label`, `aria-labelledby` or a wrapping `<label>`. Include the band number on the
    per-band controls.
  - Guide: `accessibility`, `forms`.
- [ ] **A4. Log-scaled sliders announce raw positions** (S)
  - Where: `EqFilterCard.svelte:512-527` (freq), `:589-599` (Q), `:553` and `:325` (gain ×10);
    `EqAudioPlayer.svelte` tone and seek sliders
  - Fix: `aria-valuetext` with the real value and unit.
  - Guide: `slider`.
- [ ] **A5. `MenuCarousel` declares tab roles without tab behaviour** (M)
  - Where: `src/lib/components/layout/MenuCarousel.svelte:52-160`; panels at
    `layout/AppShell.svelte:180-196, 227-243`
  - Problems: no arrow keys, no roving tabindex, no tablist name, no `role="tabpanel"`. The
    selected underline is a background span (`:154-156`), which forced colours removes. Drag is
    implemented twice (mouse and touch); `preventDefault()` in `ontouchstart` / `ontouchmove`
    (`:65, :80`) does nothing because those listeners are passive; `onmouseleave` on
    `<svelte:window>` (`:109`) never fires.
  - Fix: use the `Tabs` atom, or drop the tab roles and use buttons with `aria-current="page"`
    inside a labelled `<nav>`. Draw the underline with a border. Collapse the drag paths into
    pointer events with capture and `touch-action: pan-y`.
  - Guide: `tabs`.
- [ ] **A6. Mobile link drawer is not a dialog** (S–M)
  - Where: `src/lib/components/layout/TopNavBar.svelte:152-154, 163-205`
  - Problem: no role or name, no Escape handler, focus not moved in or returned, background not
    inert, trigger has no `aria-expanded`.
  - Fix: render through bits-ui `Dialog` with drawer classes (or a native `<dialog>` with
    `showModal()`); add `aria-expanded`.
  - Guide: `navigation-drawer`.
- [ ] **A7. No headings, no skip link, unlabelled navs** (M)
  - Where: `AppShell.svelte:158-263`, `TopNavBar.svelte:60-61, 188`, `MenuCarousel.svelte:113`,
    `atoms/AccordionItem.svelte:28`
  - Problem: the app has two `<h2>` and no `<h1>`; up to three `<nav>` have no `aria-label`; there
    is no way to skip a device list of around 1500 rows. `Accordion.Header` has no `level` (the
    bits-ui default was not checked).
  - Fix: visually hidden `<h1>` with the site title, an `<h2>` per panel, nav labels, a skip link
    to the graph or controls (target needs `tabindex="-1"`).
- [ ] **A8. Single-key shortcuts cannot be turned off** (M)
  - Where: `src/lib/services/keyboard-shortcuts.ts:112, 153-158`; `graph/GraphEqOverlay.ts:292-331`
  - Problem: `1`–`4` and `\` are active everywhere except text fields (WCAG 2.1.4). A focused
    native `<select>` is not excluded, so typeahead "1" switches the panel.
  - Fix: add SELECT to the exclusion (reuse `isWidgetFocused` from `GraphEqOverlay.ts:25`); add a
    setting to disable shortcuts.
- [ ] **A9. Resize divider is mouse-only and hidden from assistive tech** (S–M)
  - Where: `src/lib/components/layout/DragDivider.svelte:12-47`
  - Problem: `role="none"`, `tabindex="-1"`, `onmousedown` only, 5px wide, no `touch-action`.
  - Fix: pointer events with capture; `role="separator"`, `aria-orientation="vertical"`,
    `tabindex="0"`, `aria-valuenow/min/max`, a name; arrow keys move it about 15px; wider hit area
    via a pseudo-element.
  - Guide: `drag`.
- [ ] **A10. Touch targets below 24px** (M)
  - Where: `features/TutorialModal.svelte:269-276` (6×6px dots); `atoms/Button.svelte:74, 84`
    (`xs` about 19px tall); `EqFilterCard.svelte` range inputs (`h-1`); `routes/layout.css:101`
    (the only `pointer: coarse` rule)
  - Fix: a `--target-size` token (24px, 44px under `pointer: coarse`) applied as minimum sizes in
    the Button atom; `::after` inset hit areas for dots, sliders and compact icon buttons.
  - Guide: `form-factor-adaptation`.
- [ ] **A11. JS-driven motion ignores reduced motion** (S–M)
  - Where: `src/lib/graph/GraphEngine.svelte.ts:79` (`transitionDuration = 300`, used at
    141-469); `AppShell.svelte:183-184, 230-231`; `TopNavBar.svelte:169, 176`;
    `EqFilterCard.svelte:441`; `AccordionItem.svelte:39`; `TutorialModal.svelte:196`
  - Problem: the CSS rule at `routes/layout.css:265-274` does not reach D3 tweens, and probably
    not Svelte 5 transitions (they use the Web Animations API). Verify in a browser first.
  - Fix: one helper on `prefersReducedMotion` from `svelte/motion` that returns `duration: 0` (or
    swaps `fly` for a short `fade`); set the D3 duration to 0. Narrow the CSS rule to spatial
    motion and leave colour transitions on (the `motion` guide warns against the blanket form).
- [ ] **A12. Graph interactions have no keyboard path** (M–L, **open: decide scope**)
  - Where: `graph/GraphInspection.ts:113-115` (mousemove only); `graph/GraphHandle.ts:59-83, 119`
    (d3-drag and dblclick only); `graph/GraphEqOverlay.ts:157-223, 278-334` (band selection by
    click only)
  - Note: this is separate from the skipped text alternative. It affects sighted keyboard users.
    The EQ band list already covers band editing; the Y shift has no keyboard equivalent.
- [ ] **A13. Validation errors shown by colour and `title` only** (S–M)
  - Where: `EqFilterCard.svelte:317-318, 366-367, 395-396`
  - Fix: `aria-invalid` plus `aria-describedby` pointing at a visually hidden message.
  - Guide: `accessible-error-announcement`.
- [ ] **A14. Smaller items** (S each)
  - `atoms/Skeleton.svelte:19`: every skeleton is its own `role="status"`; use one per group and
    `aria-hidden` on the rest.
  - `equalizer/EqAutoEq.svelte:233`: running state has no `aria-busy`.
  - `TopNavBar.svelte:78`: `alt="topbar title"` is hard-coded English; use the site name.
  - `SelectionList.svelte:105`, `PhoneSelector.svelte:374`: "No curves loaded.", "No results.",
    "No devices." are hard-coded English; the result count is not announced after filtering.
  - `SelectionList.svelte:249-313`: per-row buttons are all named "Hide", "Remove" with no curve
    name.
  - `NormalizerInput.svelte:50`: `focus:outline-none` with no replacement ring.

## 3. Overlays and component patterns

- [ ] **O1. Popovers and the Dialog atom are not capped to the viewport** (S)
  - Where: `atoms/PopoverPanel.svelte:45`; `atoms/Dialog.svelte:45`;
    `controls/SiteSelector.svelte:64`; `features/GraphColorPicker.svelte:144`;
    `equalizer/EqOptionButton.svelte:127, 161`
  - Problem: `html` is `overflow: hidden`, so anything taller than the viewport is clipped with
    no way to scroll (landscape phone, small DAP screen).
  - Fix: `max-h-(--bits-popover-content-available-height) overflow-y-auto` plus
    `collisionPadding` in `PopoverPanel`; the `min()` pattern from `SelectMenu.svelte:88` in
    SiteSelector; `max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain` in Dialog.
- [ ] **O2. Tutorial step dots** (S)
  - Where: `features/TutorialModal.svelte:268-277, 234`
  - Problem: raw 6px buttons with no focus ring; fallback title "Tutorial step {n}" is hard-coded
    English.
  - Fix: 24×24 hit area, focus ring, Paraglide key. (`aria-current` is in A2.)
- [ ] **O3. Error and warning toasts auto-dismiss; the changelog link lives only in a toast** (S)
  - Where: `layout/AppShell.svelte:265, 85-91`; examples at
    `services/device-peq-service.svelte.ts:102`, `controls/GraphUploader.svelte:78`,
    `equalizer/EqFilterList.svelte:242`
  - Fix: `duration: Infinity` for error and warning toasts; a permanent changelog link in
    MiscPanel.
  - Guide: `persistent-toast-notifications`.
- [ ] **O4. Version toast can fire behind a modal at boot** (S)
  - Where: `AppShell.svelte:83-92, 268-269`
  - Fix: delay the toast until the tutorial and sponsor dialog are closed.
- [ ] **O5. Share copy has no fallback when the clipboard is denied** (S)
  - Where: `controls/ShareButton.svelte:8-16`
  - Problem: on a plain-HTTP deployment the user gets an error and no way to obtain the URL.
  - Fix: on failure, show the URL in a selectable field, or use an `execCommand('copy')` fallback.
    Optionally swap the icon to a check on success.
  - Guide: `copy-button`.
- [ ] **O6. Dialog shell classes are duplicated; no back-gesture dismissal** (S, optional)
  - Where: `atoms/Dialog.svelte:39-61`; `features/SponsorBanner.svelte:47-50`;
    `features/TutorialModal.svelte:184-208`
  - Fix: hoist the overlay and card classes into shared constants. A native `<dialog>` would add
    back-gesture dismissal but gives no bundle win; not recommended now.
- [ ] **O7. Accordion content is unmounted when closed** (no action recommended)
  - Where: `atoms/AccordionItem.svelte:36-44`. Find-in-page cannot reach collapsed sections, but
    a `<details>` rework is not worth it.

## 4. Forms and inputs

- [x] **F1. AutoEQ freq and Q fields commit every keystroke, unclamped** (S)
  - Where: `equalizer/EqAutoEq.svelte:133-148, 196-210`
  - Problem: typing `5` on the way to `500` sets `freqMin = 5` despite `min="20"`.
  - Fix: same as B1 (commit on `change`, clamp).
- [ ] **F2. Normalisation Hz field commits per keystroke** (S)
  - Where: `controls/NormalizerInput.svelte:12-16, 42-51`
  - Problem: an empty field writes `0`; typing `1000` runs `dataProvider.renormalizeAll()` four
    times and ignores `min="20"`.
  - Fix: commit on `change`, clamp to 20–20000, ignore empty input; add
    `focus-within:ring-1 focus-within:ring-accent` on the wrapper.
- [ ] **F3. Network device IP field** (S)
  - Where: `features/DeviceConnect.svelte:63-66, 168-193`
  - Problems: Enter does nothing; no keyboard hints; the panel closes even when the connection
    failed.
  - Fix: wrap in a `<form>` with a submit button; add `autocomplete="off" autocapitalize="none"
spellcheck="false" enterkeyhint="go"`; keep the panel open on failure. See S4 for host
    validation.
- [ ] **F4. Search and rename fields lack text-correction hints** (S)
  - Where: `controls/PhoneSelector.svelte:244-253`; `equalizer/EqOptionButton.svelte:152-158`;
    `equalizer/EqHistoryAndCompare.svelte:409-415`
  - Fix: `autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
enterkeyhint="search"` on the two search inputs (`Input` passes `restProps` through).
- [ ] **F5. Colour picker writes a bad value when a number field is emptied** (S)
  - Where: `features/GraphColorPicker.svelte:100-107, 163-233`; `utils/curve-palette.ts:103-108`
  - Problem: clearing L flashes the curve black and commits it; the dash field writes
    `"null 0"`.
  - Fix: skip the update when a value is not finite; clamp to the field's range.
- [ ] **F6. File imports** (S, plus M for drag-and-drop)
  - Where: `controls/GraphUploader.svelte:38-39, 78, 100, 132, 161-176`;
    `equalizer/EqFilterList.svelte:218-249, 465-471`; `equalizer/EqAudioPlayer.svelte:306-312`
  - Problems: `FileReader` has no `onerror` in the EQ import; `accept=".txt"` excludes other
    extensions; GraphUploader toasts are hard-coded English; no drop target anywhere.
  - Fix: `await file.text()` in try/catch with the reset in `finally`; move strings to Paraglide;
    optionally add a drop handler that reuses the parse paths.
- [x] **F7. EQ band fields: Enter and Escape have no composition guard** (S, low risk)
  - Where: `equalizer/EqFilterCard.svelte:216-232`. Same one-line guard as B7.
- [x] **F8. Y-offset field records one undo entry per keystroke** (S)
  - Where: `controls/SelectionList.svelte:70-73, 353-362`
  - Fix: commit on `change`; add `step="any"` or `step="0.5"`.
- [ ] **F9. Check the custom range slider rendering** (verify only)
  - Where: `EqFilterCard.svelte:333, 526, 562, 599`; `TargetCustomizer.svelte:154`
  - Note: `h-1 appearance-none` with no `::-webkit-slider-thumb` / `::-moz-range-*` rules in
    `routes/layout.css`. Thumb size and focus visibility need a visual check.
- Do **not** switch the gain fields to `inputmode="decimal"`: the iOS decimal keypad has no minus
  key.

## 5. Theming, colour, typography, CSS

- [ ] **T1. No focus indicator in forced-colours mode** (S for the class swap, M with the graph)
  - Where: `atoms/Button.svelte:88`; `layout/MenuCarousel.svelte:142`; 36 `outline-none` uses
    across 21 component files
  - Problem: the ring is a `box-shadow`, which forced colours removes, and Tailwind 4's
    `outline-none` emits only `outline-style: none`.
  - Fix: replace `outline-none` with `outline-hidden` (already used at `Switch.svelte:68`). Add a
    `@media (forced-colors: active)` block in `layout.css` mapping the graph tokens to system
    colours, and give background-only selected states a border.
  - Guide: `color`.
- [ ] **T2. Dark theme is applied after mount; `color-scheme` is never declared** (S)
  - Where: `stores/settings-store.svelte.ts:52-74`; `routes/+layout.svelte:15-22`;
    `src/app.html`, `cdn/cdn-index.html`, `site-template/index.html`
  - Problem: dark-mode visitors get a light flash, then a 0.3s fade, on every load. Native
    controls and scrollbars stay light in dark mode.
  - Fix: `<meta name="color-scheme" content="light dark">` in the three shells; a small classic
    inline script after `config.js` that sets `.dark` from `gt-settings-theme`, the config
    default, then `matchMedia`; `:root { color-scheme: light }` and `.dark { color-scheme: dark }`
    in `layout.css` (not `theme.css`); skip `theme-transition` on the effect's first run.
  - Note: the inline script interacts with a CSP (S2); it would need a hash.
  - Guide: `dark-mode`, `dark-mode-toggle`.
- [ ] **T3. Default palette misses AAA, and often AA** (M, **approved**)
  - Where: `defaults/theme.css:31-50, 63-82`. Usage: `text-base-content/60` ×74, `/70` ×28,
    `/50` ×21, `/80` ×14, `/40` ×4, `/25` ×1 (`MenuCarousel.svelte:147`)
  - Computed contrast of `base-content/NN` on base-100 (WCAG 2.x, alpha composited in sRGB):

    | Step | Light | Dark |
    | ---- | ----- | ---- |
    | /100 | 17.14 | 7.88 |
    | /80  | 9.41  | 5.65 |
    | /70  | 6.59  | 4.71 |
    | /60  | 4.68  | 3.88 |
    | /50  | 3.41  | 3.16 |
    | /40  | 2.55  | 2.54 |
    | /25  | 1.73  | 1.80 |

  - Semantic colours as text on base-100, light / dark: primary 3.54 / 9.08, secondary 3.52 /
    5.26, accent 7.36 / 5.50, info 2.61 / 9.09, success 1.90 / 6.74, warning 1.84 / 7.51, error
    3.60 / 4.61. Light `-content` pairs: primary 3.46, secondary 3.54, info 2.54, success 1.91,
    warning 1.84, error 3.37.
  - Graph text on base-100: axis-label 5.64 / 5.83, grid-text 3.93 / 4.55. Borders at `/20` are
    1.53 / 1.59.
  - Fix (values only, token names unchanged): raise dark `--color-base-content` to about L 93%;
    darken light primary / secondary / info / success / warning / error to about L ≤ 45%, or
    flip their `-content` to a dark ink; use `/80` as the floor for body-size text; replace the
    `/25` tab label; add a `@media (prefers-contrast: more)` block. Update the theme generator
    defaults and do a visual pass.
  - The numbers came from a throwaway script; recompute before and after the change.
- [ ] **T4. Other off-token values** (S)
  - `atoms/Switch.svelte:50-57`: unchecked thumb `bg-white` on a `bg-base-content/20` track is
    1.63:1 in light mode, and the track is 1.53:1 against base-100. Use `bg-base-100` for the
    thumb and a stronger track or a ring.
  - Scrims: `bg-black/40` (`TopNavBar.svelte:168`, `atoms/Dialog.svelte:41`,
    `features/SponsorBanner.svelte:47`), `bg-black/50` and `rgba(0,0,0,0.55)`
    (`features/TutorialModal.svelte:187, 39`). Acceptable for scrims, but they break the
    no-hard-coded-palette rule; consider a scrim token.
- [ ] **T5. Pretendard subset has no Cyrillic and almost no Czech diacritics** (S or M)
  - Where: `src/app.html:51-60` (and the CDN and site-template shells); `routes/layout.css:9-12`
  - Problem: the loaded dynamic-subset CSS covers 0 code points in U+0400–052F and 18 of 128 in
    Latin Extended-A. Czech words mix two fonts inside one word; Russian and Ukrainian render in
    the fallback beside Pretendard digits.
  - Fix, either: use the system stack for `html:lang(cs)`, `:lang(ru)`, `:lang(uk)` and skip the
    Pretendard load for them (depends on B5); or add a face with Latin Ext and Cyrillic coverage
    ahead of the system fonts.
  - Guide: `visually-stable-mixed-fonts`.
- [ ] **T6. Global rules in `layout.css` are unlayered and beat Tailwind utilities** (S plus a
      visual check)
  - Where: `routes/layout.css:88-98` (transition on `button, a, input, select`), `:144-163`
    (`select` padding), `:203-207`
  - Problem: `transition-*` utilities on buttons and links are dead
    (`features/GraphColorPicker.svelte:134`, `MenuCarousel.svelte:141`,
    `AccordionItem.svelte:30`); `px-*` on selects is overridden
    (`SelectionList.svelte:329`, `EqAudioPlayer.svelte:189`).
  - Fix: wrap the element-level rules in `@layer base { … }`, then check the five selects and the
    buttons that carry transition utilities.
- [ ] **T7. Scrollbar styling** (S)
  - Where: `routes/layout.css:184-207`
  - Problems: thumb against track is 1.39:1 light / 1.43:1 dark; applied through `*`; the
    `::-webkit-scrollbar*` rules are not wrapped in `@supports not (scrollbar-color: auto)`.
  - Fix: `--scrollbar-thumb` at about 55% `base-content`; `scrollbar-color` once on `:root`;
    wrap the WebKit block; raise the thumb under `prefers-contrast: more`.
  - Guide: `customize-scrollbar-color-and-thickness`.
- [ ] **T8. Theme cross-fade transitions five properties on every element** (S)
  - Where: `routes/layout.css:252-262`; `routes/+layout.svelte:15-22`
  - Fix: `document.startViewTransition()` around the class toggle, with a plain toggle when the
    API is missing or reduced motion is set; delete the `theme-transition` rule and timer.
  - Caveat: the live spectrum overlay would freeze for 0.3s during the transition.
- [ ] **T9. System colour-scheme preference is read once and cannot be returned to** (S–M)
  - Where: `stores/settings-store.svelte.ts:71, 103-111`
  - Fix: a `'system'` state with a `matchMedia` `change` listener; clear the stored key when the
    toggle target equals the system scheme; handle the `storage` event.
- [ ] **T10. `user-select: none` on `<body>`** (S)
  - Where: `routes/layout.css:124-125`
  - Problem: device names, EQ values, error text and the changelog cannot be selected or copied.
  - Fix: drop it from `body`; keep `select-none` on chrome (nav, toolbar, divider, graph SVG).
  - Guide: `browser-ui-theming`.
- [ ] **T11. `@theme` colour tokens are self-referential with no code-side default** (S–M)
  - Where: `routes/layout.css:27-68`
  - Problem: an operator `theme.css` missing a token leaves it invalid, silently.
    `--color-graph-compare` already needed a hand-written fallback
    (`graph/GraphCompareOverlay.ts:107`).
  - Fix: `@theme inline { … }` plus shipped defaults for every token in an `@layer base` block in
    `layout.css`. Not built or tested; verify it compiles as described.
- [ ] **T12. `px` font sizes outside the type scale** (S)
  - Where: `text-[10px]` ×18 (including `atoms/Button.svelte:74`), `text-[11px]` ×2,
    `text-[12px]` ×6; `controls/PhoneSelector.svelte:518`
  - Fix: add `--text-2xs: 0.625rem` (and `0.6875rem`) to `@theme`; replace `text-[12px]` with
    `text-xs`.
- [ ] **T13. Screenshot export hard-codes the default light palette** (S–M)
  - Where: `controls/ScreenshotButton.svelte:11-22, 105`
  - Problem: an operator's custom light theme is ignored in exported PNGs.
  - Fix: resolve the values at export time from the loaded `theme.css`.
- [ ] **T14. Small items** (S each)
  - `features/DevicePeqPushDialog.svelte:73`: `max-h-[85vh]` → `85dvh`.
  - `text-balance` on dialog and tutorial titles, `text-pretty` on descriptions and
    `InfoPopover` bodies.
  - Fixed heights on text containers (`--toolbar-height` at `layout.css:84`, `h-12` nav, `h-7`
    selects): prefer `min-block-size`.
  - 66 physical utilities (`ml-`, `pr-`, `left-`…) against 11 logical: only matters if an RTL
    locale is added.
  - Fixed overlays and safe-area insets (`TopNavBar.svelte:175` drawer): body padding does not
    apply to fixed elements. Needs a device check.

## 6. Security and privacy

No exposure reachable from a share link alone was found. B2, B3 and B8 above are the confirmed
gaps; the rest is hardening.

- [ ] **S1. squig.link scripts are fetched as text and run through `eval`** [checked] (M)
  - Where: `stores/squiglink-store.svelte.ts:140-155, 180-195`
  - Problem: trusting squig.link is deliberate, but this forces `'unsafe-eval'` into any CSP and
    rules out Trusted Types. The values then reach `href` and `fetch` unvalidated
    (`features/ShopLink.svelte:58`, `features/SponsorBanner.svelte:66, 77, 90`,
    `squiglink-store.svelte.ts:218`).
  - Fix: prefer JSON endpoints (`shoplinks.json` exists; a JSON form of the sponsor data needs
    squig.link's cooperation). Until then, extract the literal and `JSON.parse` it. Pass
    `ctaLink`, `cta2Link`, `hfg_com` and `creative` through an http(s)-only check.
- [ ] **S2. No CSP or security headers shipped or documented** (M)
  - Where: `src/app.html`, `cdn/cdn-index.html`, `site-template/index.html`, `defaults/.htaccess`;
    one `connect-src` line at `docs/src/content/docs/guide-for-admins/customize-page.mdx:923`
  - Fix: publish a recommended header set in the deployment docs and as a commented block in
    `defaults/.htaccess`: a hash-based CSP (`script-src 'self'` plus hashes, `object-src 'none'`,
    `base-uri 'self'`, `frame-ancestors 'self'`, a `connect-src` list),
    `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a
    `Permissions-Policy` keeping `hid`, `serial`, `bluetooth` and `local-network` on `self`. A
    `<meta http-equiv>` CSP for GitHub Pages. Move the font `onload` swap and inline boot scripts
    into hashed or external scripts.
  - Depends on S1. Interacts with T2 and P3 (new inline scripts).
- [ ] **S3. CDN and template builds run unpinned code with no integrity** (M)
  - Where: `site-template/index.html:99`; `cdn/cdn-index.html:89`; `cdn/loader.js:41-55, 86,
194-196`
  - Fix: document the trust chain in the CDN and GitHub Pages deployment docs; offer a pinned
    mode (`@cdn-vX.Y.Z` with a published `sha384`, per-file hashes in `boot.json`); have the
    loader reject `boot.*` URLs that do not start with `cdnBase`; protect the `cdn` branch.
- [ ] **S4. Network device host is unvalidated; Local Network Access is not handled** (S–M)
  - Where: `src/lib/device-peq/network.ts:80, 173, 181, 247`; input at
    `features/DeviceConnect.svelte:183`
  - Problem: whatever is typed is interpolated into the URL, so a hostname with a path would send
    device commands to a public host. From an HTTPS deployment the `http://` calls are mixed
    content.
  - Fix: accept only an IP literal or a `.local` name; pass `targetAddressSpace: 'local'`; map the
    `TypeError` to a clear message; document the HTTPS limitation in the device PEQ docs.
  - Guide: `local-network-access` (Chrome/Edge 145 only; other browsers ignore it).
- [ ] **S5. Uploads and remote JSON have no size or count limits** (S)
  - Where: `controls/GraphUploader.svelte:30-34`; `services/aggregate-index-core.ts:159`;
    `services/site-index-core.ts:103`; `device-peq/network.ts:90, 175, 201`
  - Fix: reject files over about 5 MB and more than N files; check per-row field types when
    building rows and skip bad rows instead of throwing.
- [ ] **S6. Google Analytics loads before any consent** (S, squig.link deployments only)
  - Where: `services/analytics-service.svelte.ts:30-69`; `services/initial-load.ts:41`
  - Fix: consent-mode defaults before `config`, or honour `navigator.globalPrivacyControl`;
    default `LOG_ANALYTICS` to false; document what is sent and how to switch it off; validate
    measurement IDs against `/^G-[A-Z0-9]+$/`.
- [ ] **S7. Font stylesheet lacks `integrity` and `referrerpolicy`** (S)
  - Where: `src/app.html:51-60`; `cdn/cdn-index.html:65-74`; `site-template/index.html:58-67`
  - Fix: `integrity="sha384-…"` and `referrerpolicy="no-referrer"` on the preload link;
    `<meta name="referrer" content="strict-origin-when-cross-origin">`. Check that jsDelivr
    serves the CORS header SRI needs.
- [ ] **S8. Shared-origin storage and the sponsor cookie** (S)
  - Where: `stores/squiglink-store.svelte.ts:115-117`;
    `stores/eq-constraints-store.svelte.ts:263-265`
  - Fix: `;Secure;SameSite=Lax` on the cookie; validate the cached catalog preset with
    `validateProfile`; optionally prefix localStorage keys with the deployment base path.
- [ ] **S9. `sanitizeHtml` is unused and its AGENTS entry is stale** (S)
  - Where: `utils/html-sanitizer.ts:234`; `utils/AGENTS.md:189-190` (says `PhoneSelector`
    renders `description` through `{@html}`)
  - Checked: the only `{@html}` sinks in components are `panels/MiscPanel.svelte:84` and
    `layout/TopNavBar.svelte:76` (operator config). `PhoneSelector` has none, so the AGENTS note
    is the stale part.
  - Fix: correct the AGENTS note. Keep the module if HTML descriptions may return; otherwise
    consider removing `sanitizeHtml` and keeping `sanitizeUrl` / `stripHtml`.
- [ ] **S10. Trusted Types cannot be enabled yet** (M, after S1 and S2)
  - Blockers: the two `eval` calls, `innerHTML` in `cdn/loader.js:256`, dynamic `script.src` in
    `services/ranking-service.svelte.ts:135-136` and `analytics-service.svelte.ts:34-36`, the
    blob-URL worker in `workers/autoeq-client.ts:17-21`, and Svelte's `{@html}`.

## 7. Performance (every gain is an unmeasured hypothesis)

Measure with the harness described in the root `AGENTS.md` Performance section. It only covers
cold startup on one origin with cache off, so several items need an added scenario.

- [ ] **P1. Shipped `.htaccess` sets no cache lifetime and no compression** (S)
  - Where: `defaults/.htaccess:1-8`; `vite.config.ts:67`
  - Fix: guarded `mod_headers` block (`immutable` for `_app/immutable/`; `no-cache` for
    `index.html`, `config.js`, `theme.css`, `data/` so operator edits still apply at once);
    guarded `mod_deflate` / `mod_brotli` block; mirror in the deployment docs.
  - Measure: a warm-cache second navigation, counting requests and bytes.
- [ ] **P2. CDN loader makes three serial round trips** (S, M to merge manifests)
  - Where: `cdn/loader.js:41-55, 84-91`; `cdn/cdn-index.html:30, 83-93`;
    `site-template/index.html:20`
  - Fix: preconnect to `raw.githubusercontent.com`; `fetchPriority = 'high'` on the injected
    loader script; publish the boot manifest inside `versions.json`; drop `?t=` from the
    version-pinned `boot.json` if a published version is never rewritten (maintainer call).
- [ ] **P3. Phone book request waits for the app's entry modules** (M)
  - Where: `src/app.html:62`; `utils/metadata-parser.ts:173-176`; `services/initial-load.ts:46`;
    `cdn/loader.js:26`
  - Fix: a small inline classic script after `config.js` that starts the fetch and stores the
    promise; `_fetchBookObject` awaits it if present and falls back to its own `fetch`. Keeps the
    hook-started sequence and stays a runtime fetch.
  - Interacts with S2 (inline script needs a hash).
- [ ] **P4. Cross-site index load waits for the slowest mirror and parses both** (S)
  - Where: `services/aggregate-index-core.ts:153-179`
  - Fix: await in preference order, return on the first valid one, abort the others, call
    `.json()` only on the winner.
- [ ] **P5. Cross-site search sorts every match on each keystroke** (S, M for a worker)
  - Where: `services/aggregate-index-core.ts:137-146, 282-292`;
    `controls/CrossSiteSearchResults.svelte:53-56`
  - Fix: sort once in `buildSearchRows`; share one `Intl.Collator`; move to a worker only if it
    still exceeds 50 ms under 4× CPU.
- [ ] **P6. Device search re-filters and rebuilds up to ~1500 rows per keystroke** (S)
  - Where: `controls/PhoneSelector.svelte:51-56, 63-68, 75-84, 108-119, 379-416`
  - Fix: precompute the lowercased identifier once in `metadata-parser`; feed the list a deferred
    query. (The auditor also claimed descriptions are re-sanitised per render; `sanitizeHtml` has
    no caller, so check what the row actually runs before acting on that part.) List virtualisation is the known remaining
    lever (L) and is already recorded in `AGENTS.md`.
- [ ] **P7. Hover inspection forces one layout per label on every `mousemove`** (S–M)
  - Where: `graph/GraphInspection.ts:113-115, 125-136, 162-272`
  - Fix: render once per `requestAnimationFrame`; keep and update row nodes; batch the width
    measurement, as `GraphContainer.flushLabelMeasure` does.
- [ ] **P8. Y-handle drag redraws everything on every drag event** (S)
  - Where: `graph/GraphHandle.ts:65-73, 85-97`; `graph/GraphEngine.svelte.ts:269-279, 426-492`
  - Fix: record `yShift` in the handler and redraw in one `requestAnimationFrame`; skip
    `.transition()` when the duration is 0.
- [ ] **P9. Analytics and shop-link requests compete with the first curves** (S, squig.link only)
  - Where: `services/analytics-service.svelte.ts:33-37`;
    `stores/squiglink-store.svelte.ts:126, 140`; `features/ShopLink.svelte:10-15`
  - Fix: `fetchPriority = 'low'` on the gtag script, or inject it after `appStore.isReady`;
    `{ priority: 'low' }` on the shop-link fetches. Leave `squiglink-intro.js` and the creative
    alone.
- [ ] **P10. Images without reserved dimensions** (S)
  - Where: `features/SponsorBanner.svelte:65-70`; `layout/TopNavBar.svelte:78`;
    `panels/MiscPanel.svelte:80`
  - Fix: `aspect-ratio` on the creative container; `width` / `height` on the logo;
    `loading="lazy" decoding="async"` on the Misc panel image.
- [ ] **P11. Font swap reflows the chrome** (S)
  - Where: `routes/layout.css:9-10`; `src/app.html:51-60`
  - Fix: `font-size-adjust: from-font`, or a metric-matched fallback `@font-face`. Decide
    together with T5.
- [ ] **P12. Spectrum overlay allocates a generator and a point array every frame** (S)
  - Where: `graph/GraphSpectrumOverlay.ts:144-176`
  - Fix: create the generator once and reuse a preallocated array.
- [ ] **P13. To measure before deciding**
  - `SmoothingButton` → `reSmoothAll` (`services/data-provider.svelte.ts:448-492`) runs
    synchronously in the click handler; unknown cost for many devices with sample sets.
  - What the ~530 KB app chunk holds that the first curve does not need (needs a bundle report).
  - Whether preloading the Latin subset files of Pretendard shortens the swap.

## Not covered by the audit

- Runtime behaviour of any kind: screen-reader output, focus return after bits-ui overlays,
  rendered target sizes, the theme flash, forced-colours appearance.
- Internals of `peq-link`, `@potatosalad775/eqcaps-client` and `eqcaps-device-bridge`.
- Files not read in full: `CrossSiteSearchResults`, `DeviceControls`, `UnipeqLink`,
  `GraphToolbar`, `TargetSelector`, `FrequencyTutorial`, `GraphSoundRangeOverlay`,
  `KeyboardShortcutBar`, `VolumeWarningDialog`, `EqChannelConflictDialog`, `ScreenshotButton`
  (asset inlining), `eq-apo.ts`, the docs-site config generator.
- Whether the rank badge `color` from a remote ranking config is constrained to a colour value.
