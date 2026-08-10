# Components

## Reach for the Atoms First

`atoms/` wraps the primitives everything else builds on: `Button`, `Input`, `Switch`, `Accordion` /
`AccordionItem`, `PopoverPanel`, `ScrollArea`, `Skeleton`. Use them rather than the bare HTML element
— they carry the focus-visible ring, the `transition-colors`, the disabled styling and the
semantic-token palette, and a raw `<button>` silently opts out of all four.

`Button` specifically:

- Takes `variant` (`primary` … `ghost`, `link`) and `size` instead of a hand-rolled class list.
  Sizes are `xs` · `sm` · `md` · `lg` · `toolbar` (icon + label, for the graph toolbar row) ·
  `icon` (`p-2`) · `icon-sm` (`p-1.5`) · `icon-xs` (`p-1`). Reach for the size before reaching for
  `class` — six components used to duplicate one hand-written height string because `toolbar` didn't
  exist.
- **`toolbar` takes its height from `--toolbar-height`** in `routes/layout.css`, not from a literal.
  Two non-`Button` elements share that row and must line up with it — `NormalizerInput`'s wrapper and
  `ShopLink`'s anchor — so the number lives in one place. `ShopLink` renders only on squig.link
  deployments, so a height changed in the other two drifts invisibly in local dev. It stays a
  variable rather than an `@utility` so `h-(--toolbar-height)` remains a plain `h-` class that
  `tailwind-merge` can resolve against a caller's override.
- `activeOnOpen` highlights a popover trigger in the accent color while its surface is open,
  replacing a hand-written `data-[state=open]:bg-accent data-[state=open]:text-accent-content`.
- **Classes are merged with `tailwind-merge`, so `class` overrides win without a `!` modifier.** This
  matters because conflicting Tailwind utilities have _equal CSS specificity_ — appending the
  caller's class to the end of the string never did anything on its own, and the winner was whichever
  utility Tailwind happened to emit later in the stylesheet. `twMerge` drops the losing class
  outright, so `class="px-3"` beats the size's `px-4`. Write plain utilities; don't add `!`.
- **`title` is required and mirrors into `aria-label`**, which overrides the button's text content as
  the accessible name. Keep the two saying the same thing, and note that anything rendered inside — a
  count, a badge — is then _not_ part of the accessible name.
- Everything else passes through to bits-ui's `Button.Root`, so `onclick`, `aria-expanded`,
  `aria-controls` and `disabled` work as written.

Only `Button` merges its classes. On a raw element — the inputs in `EqFilterCard`, say — two
conflicting utilities still tie on specificity, so `!` remains the way to force one.

Deliberate exceptions — these stay raw elements:

- **Checkboxes and radios.** `Input` is a labelled text field and does not cover them; `Switch`
  covers the toggle-switch case only.
- Anything bits-ui already owns through a `child` snippet (`Popover.Trigger`, `Combobox.Input`, …).

The conversion is not finished — raw `<button>` still appears in several older components. New code
uses the atom, and touching a raw one is a good moment to convert it.

## Directory map

- `atoms/` — Button, Input, Accordion, PopoverPanel, ScrollArea, Skeleton, Switch
- `controls/` — PhoneSelector, GraphUploader, SelectionList, ScreenshotButton, YAxisScaleButton,
  SampleChannelSelector, CrossSiteSearchResults, …
- `equalizer/` — EqAudioPlayer, EqAutoEq, EqAutoEqSelect, EqFilterCard, EqFilterList, EqPhoneSelect
- `features/` — DevicePeq, TargetCustomizer, GraphColorPicker, PreferenceBound, FrequencyTutorial,
  TutorialModal, SponsorBanner, ShopLink
- `graph/` — GraphContainer, GraphXAxis, GraphWatermark (Svelte ↔ D3 bridge; the engine itself is in
  `lib/graph/`)
- `layout/` — AppShell, TopNavBar, MenuCarousel, DragDivider
- `panels/` — DevicePanel, GraphPanel, EqualizerPanel, MiscPanel

Panels are **torn down on every panel switch.** Anything that has to survive that belongs in a store
or a service installed from `AppShell.onMount`, not in a panel-scoped `$effect`.

## Component tests

Mount with `render()` from `vitest-browser-svelte` and query through `page.getBy*` from
`vitest/browser`. Things that bite:

- **bits-ui popovers render into a portal**, so they are outside the render result's container. Query
  the document via `page`, not the returned `container`.
- **`getByLabelText` is a substring match by default** and also matches `aria-label`, so a
  one-character label like the color picker's `L` collides with "Pick color". Pass `{ exact: true }`
  for short labels. Conversely, a `<label>` that wraps both the input and a unit span (`From … Hz`)
  has that whole string as its accessible name, so `exact` fails there — anchor a regex on the
  leading word instead.
- **`fill()` fires `input`, not `change`.** A field wired to `onchange` (the sweep and range Hz boxes
  in `EqAudioPlayer`, every number box in `EqFilterCard`) needs a blur afterwards to commit, the way
  leaving the field would. Fields on `oninput` (the color picker) take `fill()` alone.
- **`render()` is async.** Most specs never await it and get away with it, but anything on the
  returned result — `rerender`, `unmount` — is `undefined` unless you do. `rerender` is the only way
  to test a component reacting to a changed prop, since a `.svelte.spec.ts` file is not a rune module
  (the Svelte plugin matches `*.svelte.ts`, which `*.svelte.spec.ts` is not). See the Escape-reverts
  case in `equalizer/EqFilterCard.svelte.spec.ts`.
- **`Button` mirrors `title` into `aria-label`**, which overrides its text content. A button whose
  title changes with state (AutoEQ's run button in graphic mode) changes accessible name too, so
  `getByRole('button', { name })` has to follow the title, not the label you see.
- **Do not wait on something the handler does first.** `GraphUploader` clears `input.value` on its
  opening line, long before it has parsed anything, so waiting on that let in-flight uploads spill
  their calls into the next test. Poll the observable effect — spy calls, a toast — until it stops
  changing.

## Boot tests

`layout/AppShell.svelte.spec.ts` and `layout/AppShell.mobile.svelte.spec.ts` mount the whole app
against the shipped `defaults/config.js` and assert the no-`?share=` path an ordinary visitor takes.
They exist because a suite that only exercises stores cannot see a boot that never finishes.

- **Mind the viewport.** Browser mode's own default is a 414×896 iframe, which is below the
  `appStore.isMobile` threshold (`window.innerWidth < 1000`) — so component tests silently ran the
  mobile layout. The `client` project now sets `browser.viewport` to 1280×800 so desktop is the
  default; mobile tests opt in with `page.viewport()`. Tests where the layout is load-bearing should
  still state it explicitly.
- **Reactive write loops hang, they don't fail.** A runaway effect blocks the main thread, so
  vitest's timeout — a timer — never fires. `installWriteBudget()` in `layout/app-boot-harness.ts`
  throws once the app writes reactive state more times than a healthy boot needs, which unwinds the
  loop and turns it into an ordinary failure naming the key that ran away. It covers `frStore`,
  `graphStore` and `eqStore`, including their `SvelteMap` fields — `$state` class fields compile to
  accessor pairs on the prototype, so every setter on the chain is instrumented without listing field
  names. A healthy desktop boot costs 11 writes against a budget of 80. Add a store to
  `writeTargets()` when one starts carrying boot-time state.
- **One boot file per page-lifetime hydration.** Stores like `preferenceBoundStore` hydrate once per
  page, so a second scenario in the same file reads whatever the first boot left behind. That's why
  mobile has its own file.
- `AUTO_UPDATE_URL` is forced off in the harness: `urlProvider.autoUpdate()` calls SvelteKit's
  `replaceState`, which throws with no mounted router.
- The `client` project sets `optimizeDeps.exclude: ['bits-ui']`. Pre-bundling gives bits-ui its own
  copy of the Svelte client runtime, and a component rendered by one instance can't read the other's
  context. Dev and build are unaffected.
- **The UI language is pinned to `en`** by `src/test-setup.client.ts`. Chromium inherits the host's
  system locale and Paraglide's `preferredLanguage` strategy follows it, so on a non-English machine
  the whole UI renders translated and every spec that queries an English string matches nothing —
  then burns its full retry timeout before failing. That was 34 failures and 200s of wall time
  locally against a green CI, which runs en-US. The pin writes `localStorage` directly:
  `context.locale` doesn't reach the page in browser mode, and importing `$lib/paraglide/runtime.js`
  from a setup file caches the real module before a spec's `vi.mock` can intercept it (MiscPanel
  mocks `setLocale`).
