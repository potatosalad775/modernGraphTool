---
title: uniPEQ Link
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

**Link with uniPEQ** shares the Equalizer panel's band list with [uniPEQ](https://unipeq.com), an
EQ app for Android and the web that writes EQ to a device connected to it. You edit with the graph
and AutoEQ here, and uniPEQ writes every change to the device: a phone dongle you can't plug into
the computer, say, or a device the browser can't reach.

It sits in the Equalizer panel, below [Hardware EQ](./device-peq.mdx).

## Linking

**Link with uniPEQ** shows a code and a QR code. Then, in uniPEQ:

- **On the same Android phone**, press **Open uniPEQ**. uniPEQ opens and joins.
- **On another phone**, scan the QR code with the camera. It opens uniPEQ, or a page that links to
  it when uniPEQ isn't installed.
- **On a computer**, press **Open uniPEQ**. uniPEQ on the web opens in a new tab and joins. Keep
  this tab open while you're linked.
- **Anywhere else**, type the code in uniPEQ's **Link with modernGraphTool**.

uniPEQ then asks whether to link with this site, by its address. Nothing reaches the device until
you say yes there. If the two apps hold different EQs, this page asks which one to keep:
**Use uniPEQ's EQ**, or **Send this EQ to uniPEQ**. Sending turns switched-off bands into 0 dB
bands and leaves left- or right-only bands out, and the question says how many of each. An empty
band list here takes uniPEQ's without asking.

## While linked

There is one band list, and both apps edit it live. uniPEQ holds it and writes the device; this
page shows each change it makes, and the last change wins when both apps edit the same band at
once. Each app keeps its own undo history, and a change made in the other app is one step in it.

- The list is one list for both ears, as a device's is: the channel picker stays on **L+R**, and
  bands have no on/off switch.
- uniPEQ's device shows in [Hardware EQ](./device-peq.mdx) as the connected device, with its
  limits as the active [EQ constraint](./equalizer.mdx#eq-constraints). **Read**, **Write**,
  **Device EQ** and **Auto-write** there act on uniPEQ, and a write uniPEQ can't make exactly asks
  for review in both apps; either app's answer closes both.
- While uniPEQ's device is reconnecting, the list can't be edited.
- If uniPEQ stops answering — the phone asleep, uniPEQ closed — the panel says so, and the link
  picks up again by itself when it answers. If Android paused uniPEQ in the background, the panel
  says for how long.

Reloading this page keeps the link without asking uniPEQ again. **Unlink** in either app ends it,
and so does ten minutes of silence.

## Privacy

The link server only introduces the two apps. The EQ, the device's name and its limits travel
between them over an encrypted WebRTC connection — directly, or through a relay that can't read it
when a network blocks direct connections — and nothing is kept once the link ends.
Operators can point the link at their own server, or turn it off: see
[Customizing the Page](../guide-for-admins/customize-page.mdx#unipeq_link).