---
title: Equalizer
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

A comprehensive parametric equalizer that provides real-time audio equalization capabilities for modernGraphTool.

## Overview

The Equalizer is a built-in panel in modernGraphTool that provides a full-featured parametric equalizer, allowing users to apply real-time audio filters to their headphone measurements.

It supports multiple filter types, preamp control, and audio playback with EQ effect applied.

## Features

- **Parametric EQ**: Support for multiple filter types (Peaking, Low Shelf, High Shelf) with adjustable frequency, gain, and Q values
- **Per-channel EQ**: Bands can apply to both ears or to the left or right channel alone, so channel imbalance and target matching can be corrected at the same time
- **Preamp Calculation**: Automatically calculates preamp gain to prevent clipping when applying EQ
- **Real-time Audio**: Toggle EQ filters to integrated audio player in real-time
- **Filter Management**: Add, remove, and modify EQ bands dynamically
- **Phone Selection**: Quick selection and switching between different headphone measurements
- **Auto EQ Generation**: Generate automatic EQ profiles based on target curves, now with low-shelf / high-shelf filter support
- **Import/Export**: Support for importing and exporting EQ settings
- **File Upload**: Upload custom frequency response and target files

## Usage

1. **Basic EQ**: Use the filter controls to adjust frequency, gain, and Q values
2. **Phone Selection**: Use the phone selector to switch between different measurements
3. **Audio Playback**: Enable audio playback to hear EQ changes in real-time
4. **Auto EQ**: Generate automatic EQ profiles based on selected target curves
5. **Import/Export**: Save and load EQ settings using the import/export functions

## The Equalizer toggle

Nothing in the panel reaches the graph or the audio player until the master **Equalizer** switch at
the top of the panel is on. Actions that only make sense with EQ live turn it on for you:

- Importing a filter file
- Running AutoEQ
- Pulling filters from a connected device (Device PEQ)
- Adding the **first** band to an empty filter list

Editing bands you already have does not touch the switch. Turning EQ off to compare against the raw
curve while you tweak is a deliberate workflow — hold <kbd>\\</kbd> for a momentary A/B flip in
either direction — so nothing re-enables it under you.

## Per-channel EQ

At the top of the filter list is a **Channel** switch with three positions — **L+R**, **L** and **R**.
It chooses which bands the list below is editing:

- **L+R** — shared bands. They apply to both ears, which is how every EQ behaved before this
  existed, and it preserves whatever channel imbalance the unit has.
- **L** / **R** — bands for that ear alone, stacked on top of the shared ones.

The count beside each label is how many bands live in that bucket. While scoped to one ear the list
shows only that ear's bands, with a line underneath reporting how many shared bands also reach it.
A band's **Applies to** control (expand the band to see it) moves it between buckets.

What each ear actually plays is *shared + that ear's own bands*. The preamp is a single number sized
for whichever ear needs the most headroom, and the on-graph average is recomputed as the mean of the
two equalized channels — so a left-only correction visibly moves the average too.

Two things to know:

- **AutoEQ follows the switch.** In **L+R** it optimizes against the average, preserving the unit's
  natural imbalance. Scoped to one ear it optimizes against that ear's measurement and replaces only
  that bucket, leaving the shared bands and the other ear alone. Running it once per ear is how you
  correct imbalance and match a target at the same time.
- **Device PEQ is shared-only.** Hardware EQ slots have no channel concept, so pushing to a device
  sends the shared bands and warns you about the left/right bands it had to skip. The graph, the
  audio preview and file export all carry the full per-channel EQ.

See [Equalizing audio](../guide-for-users/equalizing.mdx#per-channel-eq-l--r) for the workflow.

## AutoEQ band count

**Run AutoEQ** generates as many bands as the filter list already holds, so adding five bands before
running is how you ask for a five-band result. With an empty list it falls back to **8** bands.

Operators can change that fallback with `EQUALIZER.AUTOEQ_DEFAULT_BAND_COUNT` — see
[Customizing the Page](../guide-for-admins/customize-page.mdx#equalizer). Either way, the active
constraint preset's band cap wins: a connected 5-band device gets 5.

## Notes

- Requires a modern browser with Web Audio API support for audio features
- Real-time audio processing may cause increased CPU usage
- Large numbers of EQ bands may impact performance on older devices