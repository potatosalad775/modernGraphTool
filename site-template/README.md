# modernGraphTool — GitHub Pages template

Host your own frequency response database on **GitHub Pages, for free, without
installing anything.** No web server, no FTP, no build step — everything below
happens in your browser.

The app itself loads from a CDN and updates itself when a new version ships, so
this repository only ever holds _your_ settings, colors, and measurements.

**Full documentation:** [Deploying on GitHub Pages][docs]

---

## Setup

### 1. Make your own copy

Click **Use this template** → **Create a new repository** at the top of this page.

Name it whatever you like — `my-squig`, `headphones`, anything. Your site's URL
follows the name you pick:

| Repository name      | Your site will live at         |
| -------------------- | ------------------------------ |
| `my-squig`           | `username.github.io/my-squig/` |
| `username.github.io` | `username.github.io/`          |

Both work, and neither needs different settings — `index.html` detects which one
you chose. Pick the second only if that repository name is still free, since
GitHub allows one per account.

Make sure the new repository is **Public** — GitHub Pages requires it on free
accounts.

### 2. Turn on GitHub Pages

In your new repository: **Settings** → **Pages** → under _Build and deployment_,
set **Source** to `Deploy from a branch`, **Branch** to `main`, folder
`/ (root)`. Click **Save**.

Give it a minute, then reload that page — it will show your live URL. Open it:
you should see the graph tool with a set of demo measurements.

**Your site is live.** Everything from here is replacing the demo content with
your own.

### 3. Add your measurements

Measurements are plain text files — two columns, frequency and dB — the same
format CrinGraph uses.

1. Open the `data/phones/` folder in your repository.
2. Click **Add file** → **Upload files** and drag your `.txt` files in.
3. Click **Commit changes**.

Name them the way the tool expects: `Brand Model L.txt` and `Brand Model R.txt`
for a stereo pair. Delete the demo files once yours are in — open a file, then
click the trash icon.

### 4. List them in `phone_book.json`

`data/phone_book.json` turns those files into the brand and model list users
browse. Open it, click the pencil icon, and edit:

```json
[
	{
		"name": "Your Brand",
		"phones": [{ "name": "Model One", "file": "Your Brand Model One" }]
	}
]
```

The `file` value is the filename **without** the ` L.txt` / ` R.txt` ending.

Hand-editing JSON is error-prone, so there's a
[visual phone_book.json editor][editor] that reads and writes this file for you.

### 5. Make it yours

- **`config.js`** — site title, default targets, which panel opens first, and
  much more. Every option is documented in [Customizing the Page][customize], or
  build the file visually with the [config generator][generator].
- **`theme.css`** — graph and interface colors. There's a
  [theme generator][theme] for this one too.
- **`index.html`** — the browser tab title and the description used in link
  previews. The editable block is marked with a comment.
- **`assets/`** — your favicon and logo images.

---

## Updating

Nothing to do. The application loads from the CDN and picks up new releases
within its major version automatically.

When a new **major** version ships and you're ready for it, change
`MAJOR_VERSION` in `config.js`. That is the only update step this template ever
asks of you.

---

## What's in here

| Path                   | What it is                                         |
| ---------------------- | -------------------------------------------------- |
| `index.html`           | Thin loader — pulls the app from the CDN           |
| `config.js`            | Your settings                                      |
| `theme.css`            | Your colors                                        |
| `data/phones/`         | Your measurement files                             |
| `data/target/`         | Target curves                                      |
| `data/phone_book.json` | The brand and model list                           |
| `assets/`              | Favicon, logos, images                             |
| `.nojekyll`            | Tells GitHub Pages to serve files as-is — leave it |

---

## Troubleshooting

**The page loads but share links 404.** The site's subdirectory isn't being
detected. This shouldn't happen on `*.github.io`; if you're on a custom domain
served from a subfolder, set `CDN_MODE.BASE_PATH` in `config.js` to that
subfolder, with no trailing slash. See [the docs][basepath].

**A device appears in the list but its graph is empty.** The `file` value in
`phone_book.json` doesn't match the actual filename. It is case- and
space-sensitive, and must not include the ` L.txt` suffix.

**Blank page.** Usually a syntax error in `config.js` — a missing comma or
quote. Open the browser console (F12) to see the error.

**Changes aren't showing.** GitHub Pages takes up to a minute to rebuild after a
commit. Then hard-reload (Ctrl+Shift+R / Cmd+Shift+R).

---

Built with [modernGraphTool](https://github.com/potatosalad775/modernGraphTool).

[docs]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-admins/deployment/github-pages
[basepath]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-admins/deployment/github-pages#base-path
[customize]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-admins/customize-page
[generator]: https://potatosalad775.github.io/modernGraphTool/docs/config-generator
[theme]: https://potatosalad775.github.io/modernGraphTool/docs/theme-generator
[editor]: https://potatosalad775.github.io/modernGraphTool/docs/phone-book-editor
