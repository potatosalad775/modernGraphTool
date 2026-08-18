---
title: GitHub Pages
editUrl: true
head: []
template: doc
sidebar:
  order: 1
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

Host your database on GitHub Pages for free, from your browser. No web server to rent, no FTP client, no build step, and nothing to install. If you don't already have hosting, this is the fastest way to get a working site online.

## Overview

This is [CDN deployment](./cdn.mdx) with GitHub doing the hosting. You copy a template repository that already contains everything a site needs — `index.html`, `config.js`, `theme.css`, `data/`, `assets/` — turn on GitHub Pages, and replace the demo measurements with your own. The application code loads from jsDelivr and updates itself, so your repository only ever holds your own content.

Everything is editable through github.com's web interface. Git and a local editor are useful once your database grows, but nothing here requires them.

**Template repository:** [potatosalad775/modernGraphTool_site](https://github.com/potatosalad775/modernGraphTool_site)

## When to pick this

**Good fit for:**

- Operators without existing web hosting
- Anyone who'd rather not manage a server, FTP credentials, or file uploads
- Databases where measurements are added occasionally rather than daily
- Getting something online today and moving it elsewhere later — the file layout is identical to every other deployment mode, so migrating is a copy

**Bad fit for:**

- Repositories over GitHub's soft limits — Pages sites are capped at **1 GB** and Pages has a **100 GB/month** soft bandwidth limit. A measurement `.txt` file is a few KB, so this is thousands of devices' worth of headroom, but it is a ceiling
- Private databases — GitHub Pages requires a public repository on free accounts
- Sites needing server-side anything (redirects, auth, custom headers)

:::note[Already have hosting?]
Then plain [CDN Deployment](./cdn.mdx) is the same thing without the GitHub layer. This page exists for operators who don't have a server, not as a replacement for one.
:::

## Setup

### 1. Copy the template

Open [potatosalad775/modernGraphTool_site](https://github.com/potatosalad775/modernGraphTool_site) and click **Use this template** → **Create a new repository**.

You'll be asked for a repository name, and that name decides your site's URL. Both of the following work, and neither needs different configuration:

| Repository name           | Your site's URL                     | Notes                                           |
| ------------------------- | ----------------------------------- | ----------------------------------------------- |
| `my-squig` (anything)     | `your_username.github.io/my-squig/` | A **project site**. Name it whatever you like.  |
| `your_username.github.io` | `your_username.github.io/`          | A **user site**. GitHub allows one per account. |

Set the repository to **Public** — GitHub Pages needs it on free accounts.

:::tip[Which name should I pick?]
Use the `your_username.github.io` name if it's free and this is your main database — the shorter URL is nicer to share. Otherwise use a normal name; the only practical difference is the extra path segment. You can rename the repository later and the site keeps working, because the base path is detected at runtime rather than baked into a config file. See [Base path](#base-path).
:::

### 2. Turn on GitHub Pages

In your new repository, go to **Settings** → **Pages**. Under _Build and deployment_:

- **Source**: `Deploy from a branch`
- **Branch**: `main`, folder `/ (root)`

Click **Save**.

Wait a minute or so, then reload the page — it will show your live URL at the top. Open it and you should see the graph tool with a set of demo measurements.

That's a working site. Everything that follows is replacing the demo content with yours.

:::note[No GitHub Actions needed]
The template is plain static files, so Pages serves the branch directly. You don't need to enable Actions, and there's no build to wait on or debug. The only delay is Pages' own rebuild, which takes up to a minute after each commit.
:::

### 3. Upload your measurements

Measurement files are the same plain two-column text format CrinGraph uses — see [Preprocessing Measurements](../preprocessing-measurement.mdx) if you're starting from raw exports.

1. Open the `data/phones/` folder in your repository.
2. **Add file** → **Upload files**, then drag your `.txt` files onto the page.
3. **Commit changes**.

Use the naming the tool expects — `Brand Model L.txt` and `Brand Model R.txt` for a stereo pair. Once your own files are in, delete the demo ones: open a file and click the trash icon, or select several from the folder view.

:::caution[Browser upload limits]
The web uploader takes up to 100 files at a time and 25 MB per file. Measurement files are tiny, so the file-count limit is the one you'll hit first — just upload in batches. If you're migrating a large existing database, cloning the repository and copying the folder in one commit is far less tedious; see [Working locally](#working-locally-optional).
:::

### 4. Edit `phone_book.json`

`data/phone_book.json` is what turns those files into the brand and model list users browse. Open it in your repository and click the pencil icon to edit:

```json
[
	{
		"name": "Your Brand",
		"phones": [{ "name": "Model One", "file": "Your Brand Model One" }]
	}
]
```

The `file` value is the filename **without** the ` L.txt` / ` R.txt` ending. Full schema, including variants and sample sets, is in [Managing Data](../manage-data.mdx).

Editing JSON by hand is easy to get wrong, and a single missing comma blanks the device list. The [phone_book.json Editor](/phone-book-editor) is a visual editor for this file — import the one from your repository, edit it, export, and paste the result back.

### 5. Customize

- **`config.js`** — site title, initial devices and targets, normalization defaults, and every other setting. See [Customizing the Page](../customize-page.mdx), or build the file visually with the [Config Editor](/config-generator).
- **`theme.css`** — graph and interface colors. See [the theme section](../customize-page.mdx#customizing-page-styles-themecss) or the [Theme Generator](/theme-generator).
- **`index.html`** — the browser tab title and the description shown in link previews. The block you'd want to edit is marked with a comment.
- **`assets/`** — your favicon and logo images.

## Base path

A project site is served from a subdirectory named after the repository — `username.github.io/my-squig/` — and the application has to know that prefix, or the home page loads while every share link 404s. This is [the most common CDN-deployment mistake](./cdn.mdx#why-base_path-is-almost-always-required), and on GitHub Pages it would apply to almost everybody.

**The template handles it for you.** Its `index.html` contains a short script that reads the prefix off the URL before the loader starts:

```js
var seg = location.pathname.split('/').filter(Boolean)[0];
cdn.BASE_PATH = seg && !/\.html?$/i.test(seg) ? '/' + seg : '';
```

It runs only on `*.github.io` hostnames, and only when `config.js` leaves `CDN_MODE.BASE_PATH` unset. So both repository layouts resolve correctly with no configuration, and renaming your repository doesn't break the site:

| URL                                    | Detected base path |
| -------------------------------------- | ------------------ |
| `username.github.io/my-squig/`         | `/my-squig`        |
| `username.github.io/my-squig/?share=…` | `/my-squig`        |
| `username.github.io/`                  | `''` (root)        |

**You need to set `BASE_PATH` yourself in one case:** a [custom domain](#custom-domain) that serves the site from a subfolder. The hostname is no longer `*.github.io`, so auto-detection stops, and a custom domain pointed at a project site serves it from the domain root anyway — which is correct with `BASE_PATH` unset. Only if you've put modernGraphTool behind a reverse proxy or in a subfolder of a larger site do you need to set it explicitly in `config.js`:

```javascript
CDN_MODE: {
  BASE_PATH: '/headphones',
  MAJOR_VERSION: 2,
},
```

No trailing slash. To verify either way: load your site, add a device, copy the share link, and open it in a fresh tab. If it loads the same device, your base path is right.

## Updating the app

Nothing to do. The application loads from jsDelivr and picks up new releases within your pinned major version automatically — the same mechanism described in [CDN Deployment](./cdn.mdx#how-updates-propagate).

When a new **major** version ships and you're ready to move to it, edit `MAJOR_VERSION` in `config.js` and commit. That is the only update this deployment mode ever asks of you.

:::note[Template updates don't touch your copy]
The template repository is refreshed whenever modernGraphTool's defaults change, but "Use this template" makes an independent repository — it has no upstream link, so nothing there can overwrite your settings or your measurements. You don't need to re-copy it either; the application code comes from the CDN, not from the template.
:::

## Custom domain

If you own a domain, you can serve the site from it instead of `username.github.io`.

1. At your DNS provider, point the domain at GitHub Pages — a `CNAME` record to `username.github.io` for a subdomain, or `A` records to GitHub's Pages IPs for an apex domain. GitHub's [custom domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) has the current addresses.
2. In your repository: **Settings** → **Pages** → **Custom domain**, enter the domain, and **Save**. This commits a `CNAME` file to the repository — leave it there.
3. Once the DNS check passes, tick **Enforce HTTPS**.

A custom domain serves the site from the domain root, so `BASE_PATH` stays unset. See [Base path](#base-path) for the exception.

## Working locally (optional)

Everything above works in the browser. Once your database gets big enough that batch uploads become tedious, cloning the repository is worth the setup:

```bash
git clone https://github.com/username/my-squig.git
cd my-squig
# copy in measurement files, edit config.js, ...
git add .
git commit -m "Add new measurements"
git push
```

Pages rebuilds within a minute of the push.

To preview changes before pushing, serve the folder with any static file server and open it at the root:

```bash
npx serve .
```

Base-path auto-detection doesn't apply on `localhost` — it doesn't need to, since you're serving from the root there and the loader resolves an empty base path on its own.

## Troubleshooting

### The site 404s right after enabling Pages

**Cause:** Pages hasn't finished its first build.

**Fix:** Wait a minute and reload. If it persists, re-check **Settings** → **Pages** — the branch must be `main` and the folder `/ (root)`.

### The page loads but share links 404

**Cause:** The base path isn't resolving. On `*.github.io` this shouldn't happen; the usual culprit is a `CDN_MODE.BASE_PATH` that was set by hand and doesn't match the actual path, which takes precedence over auto-detection.

**Fix:** Comment out `BASE_PATH` in `config.js` and let the template detect it. On a custom domain, see [Base path](#base-path).

### A device appears in the list but its graph is empty

**Cause:** The `file` value in `phone_book.json` doesn't match the filename on disk.

**Fix:** Compare them character by character — it's case- and space-sensitive, and must not include the ` L.txt` suffix. Check the browser's network tab for the 404 to see exactly which path was requested.

### Blank page

**Cause:** Almost always a syntax error in `config.js`.

**Fix:** Open the browser console (F12). A missing comma or unclosed quote is reported with a line number. The [Config Editor](/config-generator) produces a valid file if you'd rather not debug it.

### Changes aren't showing up

**Cause:** Pages rebuild delay, or browser cache.

**Fix:** Wait a minute after committing, then hard-reload (Ctrl+Shift+R / Cmd+Shift+R). The **Actions** tab of your repository shows the Pages build status if you want to confirm it finished.

### CSS or images 404 while the app itself loads

**Cause:** A missing `.nojekyll` file. Without it, GitHub Pages runs Jekyll, which ignores files and folders whose names begin with an underscore.

**Fix:** Confirm `.nojekyll` is still in the repository root. It ships in the template — recreate it as an empty file if it was deleted.

### Stray URLs show GitHub's 404 page

Expected. The application lives at the root of your site's path and takes all its state from query parameters, so this only affects mistyped URLs. Share links are unaffected.