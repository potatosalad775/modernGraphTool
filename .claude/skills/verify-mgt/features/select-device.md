# Select a device

A visitor finds a measured device by name or brand, adds it to the graph, and removes it again.

## Sub-features

- `device-search` narrows the device list as the visitor types.
- `device-add` draws the device's curve and adds it to the selection list.
- `device-remove` takes the curve off the graph.
- `device-brand` filters the list to one or more brands.

## How to get to it (user POV)

- Open the `DEVICES` panel, type in `Search devices`, press a device row.
- Open the `DEVICES` panel, press `Brands`, press a brand, then a device row.
- Remove a device by pressing its row again, or with `Remove <name>` in the selection list
  (shown in the `GRAPH` panel, and in `DEVICES` above the device list).

## Driving it with mgt.mjs

Preconditions:

- Baseline state. `GZR HT5` is in the phone book and not on the graph.

Run `node .claude/skills/verify-mgt/mgt.mjs run .claude/skills/verify-mgt/journeys/select-device.mjs`.

- **Search.** `controls.getByRole('searchbox', { name: 'Search devices' }).fill('ht5')`. The list
  holds one `button "GZR HT5"`.
- **Add.** Click that button. An `svg text` containing `GZR HT5` appears on the graph, the row has
  `aria-pressed="true"`, and the page title contains `GZR HT5`.
- **Remove.** Click the row again. The label leaves the graph, `aria-pressed` is `false`, and the
  title no longer names the device.
- **Proof.** `shot('search')`, `shot('added')`, `aria('added', controls)`, `shot('removed')`.

## Gotchas

- The curve count is not a proof of adding. With two devices on the graph, each switches from its
  L and R curves to one average, so three curves can stay three.
- A query of two or more characters also starts a cross-site search, which reads an index on
  another host. `boot()` answers that request with an empty index; a journey that tests
  cross-site search registers its own `page.route('**/aggregate-index.json', ...)`.
- The device list is debounced. Wait for the row, never for a fixed time.
- A device name can appear three times: its row, the selection list and the graph. Scope the
  locator to `region "Controls"` and pass `exact: true`.
- `INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR: false` in `config.js` disables the second press.
  The shipped config leaves it on.
