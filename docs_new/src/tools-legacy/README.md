# Parked: the three interactive tools

These are the React sources for the Config Editor, phone_book.json Editor and Theme
Generator, carried over verbatim from the Docusaurus site (`docs/src/`) so nothing is lost
when that directory is deleted. **Nothing in here is built or routed yet** — the port is a
separate task.

Until it lands, these three URLs 404:

| URL                   | Source                                                        |
| --------------------- | ------------------------------------------------------------- |
| `/config-generator`   | `page-config-generator.tsx` → `components/ConfigEditor/`      |
| `/phone-book-editor`  | `page-phone-book-editor.tsx` → `components/PhoneBookEditor/`  |
| `/theme-generator`    | `page-theme-generator.tsx` → `components/DummyGraphPage/`     |

The landing pages (`src/content/docs/index.mdx` and `ko/index.mdx`) and ~39 in-content
links already point at these URLs, so the port restores them with no further link edits.
The sidebar entries do still need re-adding — the old site had them under an `<hr>` at the
bottom of `sidebars.ts`.

## What the port involves

`utils/` has **no framework dependency at all** and copies over unchanged whichever way the
rewrite goes:

| File                   | Lines | What it does                                                     |
| ---------------------- | ----- | ---------------------------------------------------------------- |
| `configConverter.ts`   | 1125  | Parses/emits `config.js`; v1 and CrinGraph import paths          |
| `phoneBookConverter.ts` | 642  | Parses/emits `phone_book.json`, 5 phone kinds                    |
| `configDefaults.ts`    | 410   | `ConfigFormState` — mirrors `defaults/config.js`                 |
| `oklch.ts`             | 317   | OKLab/OKLCH colour maths, palette generation                     |

**Those four are covered by co-located specs — run `npm test` from `docs_new/`.** They exist
because the rewrite is what they protect: the converters emit files operators paste into live
deployments, and a mis-wired form field produces a wrong `config.js` rather than an error. The
round-trip assertions (`state → file → state`) are the ones that catch that, so port a section
and re-run rather than eyeballing the output. CI runs them ahead of the docs build.

Writing them turned up three things worth knowing before you start:

- `prettyPrint` escaped only `\` and `"`, so a newline or tab in any string field closed the
  literal early and made the emitted `config.js` a syntax error. Fixed here via
  `JSON.stringify`; **`docs/src/utils/configConverter.ts` still has it** and is what the
  deployed site serves until cutover.
- `prettyPrint` emitted `undefined` object values as `null`, so unset optional fields came
  back set. Fixed by dropping those keys, which also removes rows of `COLOR: null` from
  generated files.
- The shipped `defaults/data/phone_book.json` contains a `"Dual Hosted"` entry this editor
  **cannot represent** — it carries both phone-level `file` and `variants[]`, and importing it
  drops `file`, publishing an entry CrinGraph cannot read. The parser warns rather than
  failing silently. `phoneBookConverter.spec.ts` pins the current behaviour deliberately; if
  the port adds a phone kind holding both, that test fails and wants updating.

The Docusaurus coupling in `components/` is shallow — five things, all mechanical:

- `@theme/Layout` — the three `page-*.tsx` wrappers only. Becomes an `.astro` page using
  Starlight's layout.
- `@docusaurus/Translate` — swap for Starlight's i18n, or inline the strings. The Korean
  translations are in the old `docs/i18n/ko/code.json`, keyed by English source text.
- `@docusaurus/Link` / `@theme/Heading` — plain `<a>` / `<h*>`.
- `useDocusaurusContext()` in `components/ConfigEditor/shared/AccordionSection.tsx:37` —
  the only real runtime dependency. It builds `learnMoreHref` from `siteConfig.baseUrl` +
  the current locale; use `import.meta.env.BASE_URL` instead.
- `@site/src/...` imports — just a path alias, so a `tsconfig.json` path entry covers them.

CSS Modules work natively in Astro. The stylesheets reference Infima variables
(`var(--ifm-color-content-secondary)` and friends) which need mapping onto Starlight's
`--sl-*` tokens.

Note `components/ConfigEditor/ConfigEditor.tsx`: its `SECTIONS` nav array lists 21 entries
but omits `section-site-selector`, even though `<SiteSelectorSection/>` is rendered. Worth
fixing during the port.
