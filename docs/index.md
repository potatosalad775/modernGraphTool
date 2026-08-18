---
title: modernGraphTool Docs
description: Documentation for modernGraphTool — a web-based frequency response
  visualization tool for headphones and IEMs.
editUrl: true
head:
  - tag: title
    content: modernGraphTool Docs
template: splash
hero:
  tagline: Docs for funky squiggly line tool
  actions:
    - text: Learn more about modernGraphTool
      link: intro/
      variant: primary
      icon:
        type: icon
        name: right-arrow
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

import { CardGrid, LinkCard } from '@astrojs/starlight/components';

## Useful tools

Visual editors and generators that help you set up modernGraphTool — no hand-editing
required.

<CardGrid>
	<LinkCard
		title="phone_book.json Editor"
		href="phone-book-editor/"
		description="Build or edit your phone_book.json visually — import an existing file, adjust brands and phones, and export the result."
	/>
	<LinkCard
		title="Config Editor"
		href="config-generator/"
		description="Build or edit config.js with a visual editor — import an existing config, adjust settings, and export the result."
	/>
	<LinkCard
		title="Theme Generator"
		href="theme-generator/"
		description="Pick colors, preview the graph and UI in light and dark mode, and download a ready-to-drop theme.css file."
	/>
</CardGrid>