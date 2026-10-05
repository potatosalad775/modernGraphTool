# Device PEQ

Reads and writes EQ on hardware. Users see it as **Hardware EQ** (the Equalizer panel section, the
docs page); the code, message keys and the docs slug `features/device-peq` keep the old name, so
translations and inbound links survive. Don't rename them to match.

Connection state lives in `stores/device-peq-store.svelte.ts`; the actions (read, write, Device EQ, auto-write) in `services/device-peq-service.svelte.ts`, so
auto-write outlives the panel; the UI is `components/features/DevicePeq.svelte` (+
`DevicePeqPushDialog`). The supported-device list is the eqcaps inspector's catalog, linked from
the panel, not a copy kept here.

The protocols are **not here**: USB HID, serial and BLE devices are driven by
`@potatosalad775/eqcaps-device-bridge`, identified and described by the eqcaps database through
`@potatosalad775/eqcaps-client` (`services/eqcaps-client.ts`), and fitted with
`@potatosalad775/eqcaps-core`. Source, format spec and design decisions: `../eqcaps` (GitHub
`potatosalad775/eqcaps`). A protocol bug or a missing device is fixed there, in a handler or a data
file, not here.

| File               | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `connect.ts`       | chooser → `matchDevice` → protocol + profile → `openDevice`; `warmUp` |
| `push-plan.ts`     | `fit` + `complete` before every write, with the changes the UI shows  |
| `preset.ts`        | which request reaches the target preset, or none                      |
| `network.ts`       | WiiM and Luxsin X9 over HTTP, behind the same `PeqDevice` shape       |
| `network-types.ts` | the network device list, without the code that talks to them          |
| `errors.ts`        | `BridgeError.code` → a user-facing sentence                           |
| `panel-status.ts`  | the panel's single status line, picked by priority                    |
| `types.ts`         | `PeqDevice` (a `BridgeDevice` satisfies it), `DeviceConnection`       |

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
  than blocking the write. Per-channel bands are still not sent.
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
- **The chooser needs the click's user activation.** `warmUp()` (on hover/focus of the connect
  buttons) starts the index load early, and a click waits at most `INDEX_WAIT_MS` for it before
  opening the chooser with the bridge's guessable vendors only.
- **Device EQ is what the device plays.** With two or more memories it's one dropdown (the
  memories plus Off), and picking an entry switches the device (`setEnabled`) at once; with one
  memory or none (a Walkplay dongle) it's an on/off switch. It replaced a Preset dropdown that
  only retargeted Read/Write plus an on/off switch that also, invisibly, switched to that
  preset: you could write a preset the device wasn't playing and hear nothing. The bypass preset
  is the off switch, not a memory: `devicePeqStore.slots` hides it.
- **Read and write only the preset they can reach** (`preset.ts`). Protocols without `readsSlot` /
  `writesSlot` act on whatever the device is on, so `devicePeqStore.deviceSlot` (reported on
  connect, updated on every switch) must equal the target; otherwise the button is disabled
  rather than reading the wrong memory or writing over a built-in or bypass preset.
- **The connected panel has one status line**, chosen by `panelStatus` (failure › auto-write
  paused › unreachable preset › clip risk › sync). Don't add another conditional `<p>` beside it:
  the old panel stacked one per state and showed "Wrote 6 bands" next to "The device has this EQ".
  Fixed facts about the profile (shared, guessed, draft, experimental, write-only) go in the
  device row's popover instead, which renders only when one applies.
- **Network devices stay local** until eqcaps has a network identity and transport. Their profiles
  are written in `network.ts` from what the old handlers accepted. EarFun Tune Pro and Topping were
  dropped with the old bridge (no eqcaps profile; Topping was never registered).

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
