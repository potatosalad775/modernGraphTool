---
title: squig.link Integration
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

Deployments hosted on a `*.squig.link` domain get a few network-wide features on top of the usual ones. They switch on automatically there and stay dormant on any other host.

- **Shop links** — when a loaded device has an entry in the squig.link shop database, a **Buy Now** button links to the sponsor's listing.
- **Sponsor banner** — a sponsor dialog with content served by the squig.link network. Dismissing it hides that sponsor for a day across every squig.link site, CrinGraph-based ones included; a new sponsorship appears straight away.
- **Analytics** — usage events go to squig.link's shared Google Tag Manager container, the one its CrinGraph sites report to, and to any GA4 property or container of your own.

Each can be switched off, and IDs of your own added, under [`SQUIGLINK`](../guide-for-admins/customize-page.mdx#squiglink) in `config.js`.

## Analytics and consent

Analytics sends the site name (`ANALYTICS_SITE`), which devices (brand, model, variant) are added to or removed from the graph, and two click events (screenshot download, shop link).

They go to squig.link's shared Tag Manager container, which needs no ID from you: it is the same container CrinGraph's `graphAnalytics.js` loads, and it receives the events in the same shape (a device added to the graph is its `phone_displayed`). To keep statistics of your own as well, list a GA4 measurement ID (`G-…`) or a Tag Manager container (`GTM-…`) in `ANALYTICS_MEASUREMENT_IDS`; anything else is skipped with a console warning. A container receives the CrinGraph-shaped events, a GA4 ID receives `gtag` events (`phone_added`, `phone_removed`, `clicked_download`, `shoplink_click`).

To switch analytics off for everyone, set `ENABLE_ANALYTICS: false`.

Who is measured, and how:

- **A visitor whose browser sends [Global Privacy Control](https://globalprivacycontrol.org/)** loads no analytics at all.
- **Every other visitor** gets a **Usage statistics** switch under Settings in the Misc panel. Switching it off stops the events at once, and from the next visit nothing is loaded for them, the same as with Global Privacy Control. The answer is kept in that browser and outranks your default.
- **Until a visitor answers**, [Consent Mode](https://developers.google.com/tag-platform/security/guides/consent) starts from `ANALYTICS_CONSENT`. `"granted"`, the default, measures normally with the `_ga` cookies. `"denied"` sets no cookie and sends cookieless pings, which Google Analytics reports only as modelled data, until the visitor switches the setting on.

The three advertising signals (`ad_storage`, `ad_user_data`, `ad_personalization`) are always denied: the tool shows no ads. The page defines the standard `gtag` function, so a consent banner of your own can call `gtag('consent', 'update', { analytics_storage: 'granted' })` and it takes effect for the containers and the GA4 IDs alike. The containers read their own data layer (`gtmDataLayer`), separate from `dataLayer`, so that an event is never counted twice.

The switch is not a consent banner. Operators who collect from visitors in regions that require consent before measuring are still responsible for obtaining it; starting from `ANALYTICS_CONSENT: "denied"` is the setting meant for that case.

:::note[Cross-site search and the site selector work anywhere]
Cross-site search used to be squig.link-only. It and the site selector now run on any host, each with its own config section — see [Cross-Site Search](./cross-site-search.mdx) and [Site Selector](./site-selector.mdx). On squig.link, cross-site search still falls back to crawling each site's `phone_book.json` if the aggregate index can't be reached.
:::