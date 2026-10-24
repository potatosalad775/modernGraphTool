---
title: Deterring Data Scraping
description: Server rules that make bulk-downloading your measurement files
  harder, without breaking the graph or cross-site search.
editUrl: true
head: []
template: doc
sidebar:
  order: 6
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

modernGraphTool is a static page, so the browser downloads every measurement it draws as a plain
`.txt` file, like CrinGraph does. Unfortunately this could make a database easy to copy in bulk: 
a script can read `phone_book.json`, build each file name and download them all within minutes.

**This can't be fully prevented.** Anything a browser can download, a determined script can
download too, and the graph's numbers are visible in the browser's developer tools anyway. 
Even if we somehow hide all the numbers with some black magic, anyone can still trace the graph
and extract the data from it using tools like usytrace. 

What you _can_ do is turn away low-effort scripts and slow down bulk downloads until they stop 
being worth it. Every measure below happens on your server. None of them changes your data files
or your `phone_book.json`, so CrinGraph dual-hosting keeps working.

:::caution[Leave `phone_book.json` reachable]
Cross-site search and the site selector reads every database's `phone_book.json` with a script.
Every rule on this page targets only the `.txt` files. If you block `phone_book.json` too, your
devices could disappear from cross-site search on every site, including squig.link.
:::

## Apache (`.htaccess`)

This works on any Apache host that allows `.htaccess` files, which includes most shared hosting.
Create a file named `.htaccess` **inside your `data/` folder** (next to `phone_book.json`,
not the one at the site root) with this content:

```apache
# Don't list the folder's contents when someone opens /data/phones/ directly.
Options -Indexes

<IfModule mod_rewrite.c>
	RewriteEngine On

	# 1. Block common download tools and scripting libraries by User-Agent.
	#    A blank User-Agent is blocked too: every browser sends one.
	RewriteCond %{HTTP_USER_AGENT} ^-?$ [OR]
	RewriteCond %{HTTP_USER_AGENT} (curl|wget|python|aiohttp|httpx|scrapy|go-http-client|node-fetch|axios|undici|okhttp|libwww-perl|java/|headlesschrome) [NC]
	RewriteRule \.txt$ - [F,NC]

	# 2. Only serve measurements to the page itself. When the graph loads a file, the
	#    browser sends "Sec-Fetch-Site: same-origin". Opening the file's URL directly
	#    sends "none", and another website loading it sends "cross-site".
	#    Browsers too old to send this header at all are still served.
	RewriteCond %{HTTP:Sec-Fetch-Site} ^(none|cross-site)$ [NC]
	RewriteRule \.txt$ - [F,NC]
</IfModule>
```

Blocked requests get **403 Forbidden**. Your page keeps working normally. To check that the rules
are active, open one of your measurement files directly in the browser's address bar. It should
now show a 403 error instead of the numbers.

What each part stops:

- **`Options -Indexes`** stops someone from listing the whole `phones/` folder and downloading it
  without even reading `phone_book.json`. Many hosts already disable listings, but adding this
  line makes sure.
- **Rule 1** turns away scripts that announce themselves as `curl`, `wget`, Python and so on. Most
  quick scraping scripts never change that header.
- **Rule 2** stops people from downloading files one by one through their browser, and stops other
  sites from loading your measurements from your server.

:::caution[If your site shows "500 Internal Server Error"]
Some hosts don't let `.htaccess` files change `Options`. Remove the `Options -Indexes` line and
reload the page. The rewrite rules work without it.
:::

These rules are a speed bump, not a lock. A script can claim to be Chrome and send the same headers
a browser does. Rate limiting (below) is what still slows down a script that does that.

:::note[Another app reads your `.txt` files directly?]
If you run a separate tool that downloads your measurement files (an app, a script of your own, a
partner site), rules 1 and 2 will block it too. Add an exception for it, for example
`RewriteCond %{HTTP_USER_AGENT} !MyTool` as the first condition of each rule. Without the `[OR]`
flag, a condition is combined with the next one using AND.
:::

### Rate limiting on Apache

Apache can't count requests per visitor from a `.htaccess` file, so shared hosting can't rate
limit on its own. On shared hosting, use [Cloudflare](#cloudflare) in front of the site instead.

If you run the server yourself, the `mod_evasive` or `mod_qos` modules can block an address that
sends too many requests too quickly. When you tune either one, remember that a normal page load
fetches dozens of files within a second or two. A device with several sample runs adds two files
per run, and someone comparing devices adds files every few seconds. Base your limit on that, not
on what a typical web page needs.

## `robots.txt`

`robots.txt` is a polite request, not a block: search engines and the major AI crawlers follow it,
and scrapers ignore it. Still, it keeps your measurements out of search results and out of
well-behaved AI training crawls. Add these lines to the `robots.txt` at your site root:

```text
User-agent: *
Disallow: /data/phones/
Disallow: /data/target/
```

Disallow the two folders, **not `/data/` as a whole**, so `phone_book.json` stays crawlable. If
your site lives in a subdirectory, include that in the paths (for example `/iems/data/phones/`).

## Cloudflare \{#cloudflare\}

If your domain goes through [Cloudflare](https://www.cloudflare.com/) (the free plan is enough),
you can stop bulk downloads even from scripts that pretend to be a browser, on any host:

- **Rate limiting rule** (_Security → WAF → Rate limiting rules_). Count requests per IP address
  where the URI path ends with `.txt`, and block for a while when the count goes over the limit.
  A limit of about 50 requests per 10 seconds leaves room for a person loading a sample set and
  quickly comparing several devices. A script downloading the whole database goes far over it.
  The free plan allows only a short counting window. Check the dashboard for your plan's limits.
- **Bot protection** (_Security → Bots_). _Bot Fight Mode_ and _Block AI bots_ turn away known
  automated clients across the whole site, before they reach your server.

Keep any rule that applies to the whole site away from `phone_book.json`, for the reason given at
the top of this page. After changing a rule, load your site, add a few devices to make sure the
graph still loads, and use cross-site search once.

## GitHub Pages

GitHub Pages doesn't support `.htaccess` files or custom server rules, so only the
[`robots.txt`](#robotstxt) step applies. To use rate limiting, put a custom domain in front of the
site and route it through [Cloudflare](#cloudflare).