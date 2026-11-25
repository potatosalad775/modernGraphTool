# Device PEQ

Reads and writes EQ on hardware. Users see it as **Hardware EQ** (the Equalizer panel section, the
docs page); the code, message keys and the docs slug `features/device-peq` keep the old name, so
translations and inbound links survive. Don't rename them to match.

Connection state lives in `stores/device-peq-store.svelte.ts`; the actions (connect, read, write,
Device EQ, auto-write) in `services/device-peq-service.svelte.ts`, so auto-write outlives the panel.
The UI is `components/features/DevicePeq.svelte`, the Hardware EQ section, which shows
`DeviceConnect` (the ways in), `UnipeqLink` and `DeviceControls` (+ `DevicePeqPushDialog`) by state.
The supported-device list is the eqcaps inspector's catalog, linked from the panel, not a copy kept
here.

**Hardware EQ holds one connection at a time**: one made in this browser, or uniPEQ's over the link.
Idle, the section offers both; anything past that hides the other until it ends. The services
enforce it, not just the markup: `devicePeqService.connect` refuses while `linkStore.active`, and
`linkService` won't open a room while `devicePeqStore.localActive` (connecting, choosing a profile,
or connected here). Nothing downstream has to arbitrate between a local device and a linked one —
keep it that way rather than reintroducing a precedence rule.

The protocols are **not here**: USB HID, serial and BLE devices are driven by
`@potatosalad775/eqcaps-device-bridge`, identified and described by the eqcaps database through
`@potatosalad775/eqcaps-client` (`services/eqcaps-client.ts`), and fitted with
`@potatosalad775/eqcaps-core`. Source, format spec and design decisions: `../eqcaps` (GitHub
`potatosalad775/eqcaps`). A protocol bug or a missing device is fixed there, in a handler or a data
file, not here.

| File                | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `connect.ts`        | chooser → `matchDevice` → protocol + profile → `openDevice`; `warmUp` |
| `push-plan.ts`      | `fit` + `complete` before every write, per ear where driven apart     |
| `preset.ts`         | which request reaches the target preset, or none                      |
| `network.ts`        | WiiM and Luxsin X9 over HTTP, behind the same `PeqDevice` shape       |
| `network-types.ts`  | the network device list, without the code that talks to them          |
| `network-host.ts`   | the typed address: what a network device may be addressed by          |
| `link.ts`           | a device connected in uniPEQ, over the uniPEQ link; list conversions  |
| `device-eqs.ts`     | a device's EQs, and the connection viewed as one of them (`eqView`)   |
| `controls.ts`       | the device's own settings: which EQ each belongs to, which widget     |
| `control-labels.ts` | their translated names (apart: the store imports `controls.ts`)       |
| `errors.ts`         | `BridgeError.code` → a user-facing sentence                           |
| `panel-status.ts`   | the panel's single status line, picked by priority                    |
| `types.ts`          | `PeqDevice` (a `BridgeDevice` satisfies it), `DeviceConnection`       |

`connect.ts`, `network.ts` and everything they import are reached through dynamic `import()`, so
neither the bridge nor the client is in the boot bundle. `eqcaps-core` is (the constraint store
needs it at boot); keep it the only one.

## Invariants

- **Every write is `fit` + `complete`d first, and what `fit` changed is shown before writing**
  (`planPush` → `needsConfirmation` → `DevicePeqPushDialog`). The bridge writes exactly what it is
  given and refuses what the wire can't carry; it never clamps or pads. This replaced
  `normalizeFiltersForDevice`, which moved out-of-range frequencies to 100 Hz and turned shelves
  into flat peaks with a `console.warn`. Don't reintroduce a silent rewrite anywhere on this path.
- **A push writes the layout on screen.** A disabled band goes out as 0 dB at its own Fc and Q,
  and eqcaps' `fit` (≥ 0.2.1) writes 0 dB bands into the slots the active ones leave, as vendor apps
  do, so a read-back matches the list. Before 0.2.1 they became `complete`'s fillers (log centre of
  the range, Q 1: nine bands at 632 Hz on a 10-band device). Slots the list still leaves empty
  (`plan.emptySlots`) take the target preset's own bands, flat: the push reads it first
  (`readLayout`) and passes it to `complete` as hints (eqcaps ≥ 0.2.2). Only when there are empty
  slots, and only a preset the device can read; a failed read falls back to neutral fillers rather
  than blocking the write.
- **Per-ear bands go to a device that drives its channels apart, and only to one**
  (`drivesChannelsApart`: the profile's `channels` is `independent` **and** the bridge's
  `perChannel` is set for the EQ viewed; a Qudelix's SPK EQ, the Topping DX5 II). `planPush` then
  plans each ear from `effectiveFilters` (shared + its own) and the push carries `right`, alike or
  not: a Topping only updates its left/right mode on a write that names both. `listFromPull` is
  the way back: a slot both ears hold alike is a shared band, the rest are L's and R's. Everywhere
  else one filter set drives both ears, per-ear bands are skipped and counted (`skippedChannel`),
  and the review says so.
- **The same flag unlocks the Channel picker** (`setDeviceConstraint(…, perChannel)` →
  `eqConstraintsStore.supportsPerChannel`). The constraint checks already ran per output, so
  nothing else had to change for a per-ear list under a device's limits.
- **Connecting never edits the filters.** `devicePeqStore.setConnected` makes the device's profile
  the active constraint, which only flags what doesn't fit; the user folds it with **Fit**. The old
  connect re-clamped the list from a panel `$effect` (and needed `untrack` to stop it looping).
  The constraint swap lives in the store so it holds however the connection ends, panel mounted
  or not.
- **Profiles say what a device accepts; the bridge says how to talk to it.** A matched profile's
  `protocol` (or the most specific match's, `protocolForMatches`) picks the handler. With no match,
  `guessProtocol(vendorId)` drives a known vendor's device as experimental, with a profile built
  from `analyzeCodec` — what the protocol's frames can carry — so a push is still always fitted.
- **Ties and nameless ports ask the user.** `matchDevice` refuses to pick between equal matches,
  and a Bluetooth serial port names no device; `connect.ts` returns `kind: 'choose'` with
  candidates rather than guessing.
- **The firmware is read only when it can decide the match.** The Fosi DS3's 8- and 32-band
  firmware share a USB identity, and `matchDevice` ignores firmware ranges unless it is given a
  version. So `identify` asks the open HID device when a matched profile has a range and the top
  matches share a handler that reads one, then matches again. Only then: a device that doesn't
  answer costs the handler's timeout. Unanswered, the tie's labels say which firmware each is for.
- **The chooser needs the click's user activation.** `warmUp()` (on hover/focus of the connect
  buttons) starts the index load early, and a click waits at most `INDEX_WAIT_MS` for it before
  opening the chooser with the bridge's guessable vendors only.
- **Device EQ is what the device plays.** With two or more memories it's one dropdown (the
  memories plus Off), and picking an entry switches the device (`setEnabled`) at once; with one
  memory or none (a Walkplay dongle) it's an on/off switch. It replaced a Preset dropdown that
  only retargeted Read/Write plus an on/off switch that also, invisibly, switched to that
  preset: you could write a preset the device wasn't playing and hear nothing. The bypass preset
  is the off switch, not a memory: `devicePeqStore.slots` hides it.
- **The EQ switch can be its own state** (`readsEnabled`): the DS3 reports the preset it is on
  whether its EQ is on or off, so a slot no longer implies the EQ is on. `devicePeqService` reads
  the switch where the protocol has one and `setConnected` takes it over the bypass-preset rule.
  With the EQ off, Device EQ shows Off and Read still reaches that preset.
- **Built-in presets aren't written.** eqcaps marks the user memories of a list that mixes them with
  built-in curves (`writable`, format 1.1), and the bridge doesn't enforce the marks, so
  `writeTarget` has to. Read and Device EQ still reach a built-in preset. A list with no marks is all
  memories. `acceptCapabilities` keeps the marks, so a linked device behaves the same.
- **Read and write only the preset they can reach** (`preset.ts`). Protocols without `readsSlot` /
  `writesSlot` act on whatever the device is on, so `devicePeqStore.deviceSlot` (reported on
  connect, updated on every switch) must equal the target; otherwise the button is disabled
  rather than reading the wrong memory or writing over a built-in or bypass preset.
- **A device that restarts to save is reopened by itself** (`#awaitRestart`, `RESTART_WAIT_MS`);
  Reconnect is only what's left if it doesn't come back. Every reopened connection carries `reopen`
  again, or the second save would strand it. `#reopened` keeps `synced` while the device is on the
  same preset: connecting never reads, so nothing else would say the list still matches.
- **A device that goes is disconnected at once** (`onLost`, where the browser reports it), which
  lifts its limits and stops auto-write. It's kept when it is expected to go: `needsReconnect`, or
  a write under way on a `disconnectOnSave` device, which can drop before the write returns.
- **The connected panel has one status line**, chosen by `panelStatus` (failure › auto-write
  paused › built-in preset › unreachable preset › a setting that turns the EQ off › clip risk ›
  sync). Don't add another conditional `<p>` beside it: the old panel stacked one per state and
  showed "Wrote 6 bands" next to "The device has this EQ".
  Fixed facts about the profile (shared, guessed, draft, experimental, write-only) go in the
  device row's popover instead, which renders only when one applies.
- **A device's own settings are not part of the list** (eqcaps `protocol.controls`: a headroom, a
  DAC filter). `devicePeqService.setControls` writes one at once, through `writeControl`; it is no
  undo step, Write never sends it, and `synced` / `inSync` don't see it. The rows
  (`DeviceSettings`) show `devicePeqStore.controlValues`, which is what the device last **read
  back**, never the press, so a refused write leaves the row where it was. Every write is followed
  by a full `readControls`, because one setting can decide which others exist; a control that reads
  `null` is absent right now and gets no row.
- **A setting bound to an EQ (`control.eq`) sits under Device EQ, the rest below the rule**
  (`eqControls` / `deviceControls`). They are read again after a preset switch and a Read
  (`#readEqControls`): a Qudelix keeps its crossfeed with the preset. On a device with several
  EQs they are those of the EQ viewed (`devicePeqStore.eq`).
- **A device with several EQs is reached as one of them** (eqcaps SPEC §9.2; a Qudelix's user EQ
  and its SPK EQ). `devicePeqStore.connection` is the device **viewed as** the picked EQ
  (`eqView`): that EQ's profile, presets and `pull` / `push` / `setEnabled`, so the constraint,
  Device EQ, Read, Write and auto-write need no EQ id. `devicePeqStore.opened` is the device as
  `connect.ts` returned it, and is what `reopen` and `onLost` belong to: compare against it, not
  `connection`, where the question is "is this still the same device". For a one-EQ device the
  two are the same object.
- **Picking an EQ is a retarget, as picking a preset is** (`selectEq`): it reads nothing, leaves
  the band list alone and clears `synced`. uniPEQ reads the EQ and asks about unwritten changes
  instead, because its list is the device's document; here the list is the user's EQ for a
  headphone and connecting never reads either. Don't port that dialog.
- **The device is asked which EQs its mode has**, on connect and on every switch (`absentEqs`: an
  EQ view whose `currentSlot` answers `unsupported`), and how many bands the EQ has
  (`reportedBands`): a Qudelix in single-EQ mode has no SPK EQ and a 20- or 30-band user EQ where
  its profile counts 10. The count goes into the view's profile, since writing fewer bands than
  the device has leaves the rest playing. A mode changed mid-session is noticed only when an
  operation fails `unsupported` (`#checkEq`), which falls back to the profile's own EQ.
- **The Device Setting box is one grid** (`components/features/device-rows.ts`): Device EQ and
  every setting are subgrid rows of it, label on the left, control on the right. That is what keeps
  the controls one width whatever the labels' lengths and the row gaps equal. A new row takes
  `deviceRowClass`; don't give one its own flex layout, or put a label to the right of its switch.
- **The same names and widgets as uniPEQ** (`control-labels.ts`, `rangeChoices`, `balanceOf`): a
  role gives the translated name, values keep the vendor's. Change them in both apps or neither.
  The link carries no controls and no EQ list (peq-link 1.3), so a linked device shows neither:
  uniPEQ sends the profile of the EQ it has picked, and that is the one this page sees.
- **A device in uniPEQ is a `'link'` connection** (`link.ts`, bound by
  `services/link-service.svelte.ts`). uniPEQ holds the shared list and writes its device, so
  `push` is never called: Write, Device EQ, Reconnect and the auto-write switch are commands to
  uniPEQ, `devicePeqStore`'s flags (and `reportedInSync`) are mirrored from its `status`, and its
  review shows in `DevicePeqPushDialog` through `LinkDialogs`. `devicePeqService`'s own auto-write
  skips a link connection. Its Unplug button is hidden: closing it unlinks, which **Unlink** above
  it already does.
  The profile arrives over the wire, so `acceptProfile` refuses one eqcaps can't use rather than
  letting `resolveSlot` throw in every band card.
  Unlike a device connected here, a link connection is not assumed to play this page's sound
  (`devicePeqStore.audioThroughDevice`, in `stores/AGENTS.md`): the player keeps applying the EQ
  until the user says otherwise, or uniPEQ was opened from this page (`linkStore.launchedHere`).
- **Network devices stay local** until eqcaps has a network identity and transport. Their profiles
  are written in `network.ts` from what the old handlers accepted. EarFun Tune Pro and Topping were
  dropped with the old bridge (no eqcaps profile; Topping was never registered).
- **A network device's address is validated, twice.** The typed host goes into
  `https://${host}/…`, so `parseNetworkHost` (`network-host.ts`) accepts only an IPv4 or IPv6
  literal or a single-label / `.local` name, with an optional port, and refuses anything with a
  scheme, path, query, `@` or whitespace and any other (public) hostname. `DeviceConnect` shows its
  message beside the field; `connectNetworkDevice` and `netFetch` (the only place a URL is built)
  check again and throw `NetworkHostError` before any fetch. **Private ranges are not enforced**:
  devices are reached over VPNs and routed subnets, and a range says nothing about ownership; the
  rule is "not a public name", not "a LAN address". For the same reason `targetAddressSpace` is
  declared only where the text settles it (`addressSpaceOf`): a VPN or CGNAT address is "public" to
  the browser, and a wrong declaration makes it abort the request. A name (`wiim`, `wiim.local`) is
  declared `local` as the likely case, and `netFetch` asks once more with nothing declared when that
  fails, which covers a VPN name or a hosts-file one. A `TypeError` from fetch
  (mixed content, a denied Local Network Access prompt, nothing there) becomes `NetworkAccessError`,
  which `errors.ts` matches by name.
- **A device's answer is read through `readBoundedText`** (1 MB: `Content-Length` first, then the
  bytes counted while reading), never `response.text()`. Past the cap it throws
  `NetworkResponseError`, which `errors.ts` shows as "unexpected answer". Keep new device fetches on it.

## Testing

Feature detection reads `navigator.hid` / `.serial` / `.bluetooth` with the `in` operator, which
walks the prototype chain — **a test that hides a transport has to delete it from
`Navigator.prototype`**, not shadow it with `undefined` on the instance. See
`components/features/DevicePeq.svelte.spec.ts`.

- `DevicePeq.svelte.spec.ts` mocks `connect.js` and `network.js` and hands the component fake
  `PeqDevice`s (`vi.fn<PeqDevice['push']>`), so no permission prompt and no bridge.
- `connect.spec.ts` mocks the bridge's `/browser` entry and the client, and keeps the bridge
  itself real, so `openDevice` still checks each protocol against its transport.
- Codec correctness is eqcaps' job — its specs decode recorded device captures. Don't port byte-level
  handler tests here.
