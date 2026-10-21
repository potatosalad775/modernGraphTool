---
title: Translating
description: "Translate modernGraphTool in your browser with Fink: no code, no
  git, just a GitHub account."
editUrl: true
head: []
template: doc
sidebar:
  order: 5
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

modernGraphTool's interface is translated by its users. You don't need to know how to code, use git
or install anything. Translations are edited in [Fink](https://fink.inlang.com), a free editor that
runs in your browser and turns your edits into a pull request.

**[Open modernGraphTool in Fink →](https://fink.inlang.com/?repo=potatosalad775/modernGraphTool&project=project.inlang)**

:::tip[Partial translations are welcome]
Anything you leave untranslated shows in English. Ten translated strings are already worth sending,
and someone else can pick up where you stopped.
:::

## What you need

- A free [GitHub account](https://github.com/signup). You can try the editor without one, but your
  edits stay in your browser until you sign in.
- The **Inlang GitHub App** installed on your own account:
  [github.com/apps/inlang/installations/new](https://github.com/apps/inlang/installations/new). It
  lets Fink save your work to your own copy (a _fork_) of the repository. Fink offers the same page
  from **Grant repository access** in its account menu.

## Translating an existing language

1. Open the [project in Fink](https://fink.inlang.com/?repo=potatosalad775/modernGraphTool&project=project.inlang).
2. In the language menu, keep **From** on English and pick your language under **Translate into**.
3. Choose the **To do** filter. It lists every string your language is missing, or has a problem
   with.
4. Click a string and type. **Start from English** copies the English text in for you to overwrite.
   Your work is saved in your browser as you go.
5. When you're done, follow [Sending your translation](#sending-your-translation).

## Adding a new language

You don't need to ask anyone first. Any language can be added from Fink itself:

1. Sign in, then choose **Fork** in the bottom bar. Do this **before** step 2: changes in the
   Settings tab don't carry over into the fork.
2. In the **Settings** tab, add your language's code to the list of languages: `de` for German,
   `ja` for Japanese, `pt-BR` for Brazilian Portuguese, and so on. Use the
   [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag) for your language.
3. Translate as above. The file for your language is created when you push its first
   translations.

Once your pull request is merged, the new language appears in the app's language picker under its
own name, and visitors whose browser prefers it get it automatically.

## Sending your translation

1. Choose **Fork** in the bottom bar, if you haven't already. Fink creates your copy of the
   repository and moves your edits into it.
2. Choose **Review** to check every change, then **Push**.
3. Choose **Open pull request**. GitHub opens with the pull request filled in; describe what you
   translated and submit it.

That's it. The maintainer reviews it, and your translation ships with the next release. More detail
is in Fink's own guide to
[forks and pull requests](https://fink.inlang.com/docs/branches-forks-and-pull-requests).

## What to keep as is

- **Placeholders in braces**, like `{count}` or `{name}`. Move them wherever your grammar needs
  them, but don't translate or rename them. Fink warns you if one goes missing.
- **Product names**: modernGraphTool, squig.link, uniPEQ, AutoEQ, CrinGraph.
- **Messages themselves.** Don't add, delete or rename messages in Fink. Those changes come with
  code changes, so they belong in a regular pull request.

**Counts.** When the English text changes with a number ("1 band", "2 bands"), Fink shows the
message as several _forms_. If your language needs different forms than English, choose
**Split by \{count\}** and Fink adds the ones it needs: Czech or Ukrainian, for example, use one
form for 1, another for 2–4 and a third for 5 and up. See Fink's
[plurals guide](https://fink.inlang.com/docs/plurals-and-selects).

## Translating offline

If you'd rather work in a text editor, or can't use GitHub through Fink, there is a file-based
alternative: each language may have a `messages/_missing_translations_<locale>.json` file listing
what it still lacks, pre-filled with the English text. Replace the values you can, delete the ones
you can't, and open a pull request with that file. The details are under
[Translation contribution flow](./i18n.mdx#translation-contribution-flow).