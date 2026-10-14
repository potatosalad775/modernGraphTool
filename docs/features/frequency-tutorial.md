---
title: Frequency Tutorial
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

The Frequency Tutorial overlays the graph with labeled frequency regions — Sub Bass, Bass, Lower Mids, Upper Mids, Presence and Brilliance — each with a short description of what it contributes to the sound. It's an aid for visitors still learning to read FR graphs. For how to use it, see [Appearance and language](../guide-for-users/appearance-and-language.mdx#frequency-tutorial).

The strip is hidden by default to leave room for the graph — it matters most on mobile, where it would sit between the graph and every panel. Visitors show it with the **Freq. Guide** button in the graph toolbar (on mobile, in the Graph panel), and the choice is remembered on their device. Clicking a region's button highlights it on the graph and shows its description. The labels are UI strings, so they follow the visitor's chosen language.

Operators who want first-time visitors to see it can set [`INTERFACE.SHOW_FREQUENCY_TUTORIAL_ON_INITIAL_LOAD`](../guide-for-admins/customize-page.mdx#show_frequency_tutorial_on_initial_load) to `true`; a visitor who turns it off stays off. The text ships with the app's translations, so changing it means a source build — see [Internationalization](../guide-for-developers/i18n.mdx#frequency-tutorial-text).