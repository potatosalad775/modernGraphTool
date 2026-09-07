---
title: Cross-Site Search
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

Search for a device across other measurement databases from your own site's search box. Results
link straight to the matching site with the device loaded.

## Overview

When a visitor searches for a device you don't have, modernGraphTool can show them who does.
Below your own results, it lists matches from other public measurement databases, grouped by
site and rig type.

This works on **any host** — squig.link is not required. Cross-site search reads a single
prebuilt index document, so it costs one request no matter how many databases are listed.

The index comes from [GraphAggregator](https://github.com/HarutoHiroki/GraphAggregator), a
community project that crawls known measurement databases and publishes their device lists as
one JSON file. modernGraphTool ships with its official URLs built in, so there is nothing to
set up.

## Comma-separated queries

Typing `hd 600, u12t` asks a different question: *which database has **both** of these?* Only
databases carrying a match for every term are listed, and each one shows all of its matching
devices — so a visitor comparing two devices can find a site that measured them on the same rig
instead of stitching two sites' graphs together.

The **i** button next to the search field lists these tips in the UI, so visitors don't have to guess the syntax.

A term is only applied once it reaches two characters, so results don't churn while the visitor
is still typing the second one. A trailing comma is ignored.

Your own site's device list reads the same query, but unions the terms there — one device can't
be both, so it shows the devices matching either, ready to be loaded together.

## Configuration

Configured in `config.js`:

```javascript
CROSS_SITE_SEARCH: {
    ENABLED: true,
    INDEX_URLS: [],
}
```

### Comma-separated queries

Typing `hd 600, u12t` asks a different question: *which database has **both** of these?* Only
databases carrying a match for every term are listed, and each one shows all of its matching
devices — so a visitor comparing two devices can find a site that measured them on the same rig
instead of stitching two sites' graphs together.

A term is only applied once it reaches two characters, so results don't churn while the visitor
is still typing the second one. A trailing comma is ignored.

Your own site's device list reads the same query, but unions the terms there — one device can't
be both, so it shows the devices matching either, ready to be loaded together.

## Configuration Options

- **`ENABLED`**: Toggle cross-site search. Defaults to on.
- **`INDEX_URLS`**: Index documents to try, in order. Leave empty to use the official
  GraphAggregator index (with its GitHub Pages mirror as an automatic backup).

## Self-hosting the index

If you'd rather not depend on a third-party origin, publish your own index document and point
`INDEX_URLS` at it:

```javascript
CROSS_SITE_SEARCH: {
    ENABLED: true,
    INDEX_URLS: [
        'https://example.com/my-index.json',
        'https://backup.example.com/my-index.json'
    ],
}
```

Each URL is tried in order and the first one that returns a valid document wins, so a mirror
can be listed as a backup. The document must follow the GraphAggregator schema — see the
[GraphAggregator repository](https://github.com/HarutoHiroki/GraphAggregator) for the spec and
for tooling that generates it.

## Notes

- Databases hosted on the site the visitor is already on are filtered out of the results.
- Results are capped at 100 per query. When more match, a hint invites the visitor to refine
  the search.
- The index is fetched once, lazily, the first time a visitor types at least two characters —
  it costs nothing for visitors who never search.