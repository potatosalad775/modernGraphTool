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

It sits in the Equalizer panel's [Hardware EQ](./device-peq.mdx) section, under the connect buttons.
Hardware EQ holds one connection at a time, so the link is hidden while a device is connected in
this browser, and the connect buttons are hidden while the link is on. **Disconnect** or
**Unlink** to switch.

## What uniPEQ is

uniPEQ is a free, open-source companion app for the parametric EQ built into many USB DACs, dongles,
headphones and IEMs. It reads the EQ a device holds, lets you edit it on a graph, and writes it
back. It knows the same devices as [Hardware EQ](./device-peq.mdx), since both run on
[eqcaps](https://github.com/potatosalad775/eqcaps).

- **On a computer**, it runs at [unipeq.com](https://unipeq.com) in Chrome, Edge or another
  Chromium-based browser.
- **On Android**, it is an app: the APK is on
  [GitHub Releases](https://github.com/potatosalad775/uniPEQ/releases/latest).

In a Chromium-based browser on a computer, Hardware EQ already writes to a device from this page.
The link matters where this browser can't reach the device. The main case is a phone: a phone's
browser can't reach USB devices, so tuning against a measurement used to need a computer. Open this
site on the phone, link it with uniPEQ, and the EQ you build here plays on the device plugged into
that phone. The same goes for Firefox or Safari on a computer, linked with uniPEQ on a phone.

No device at hand? uniPEQ's **demo device** lets you try the link without one.

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