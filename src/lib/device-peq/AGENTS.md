# Device PEQ Bridge

Pushes EQ to 20+ hardware devices over WebHID / WebSerial / Web Bluetooth / network. Connection
state lives in `stores/device-peq-store.svelte.ts`; the UI is
`components/features/DevicePeq.svelte`.

Every transport is reached through a dynamic `import()`, so nothing here loads until the user picks
a device.

## Testing

`handlers/__fixtures__/fake-device.ts` provides:

- `FakeHidDevice` — records `sendReport`, replays `inputreport`, and supports both the
  `addEventListener` and `oninputreport` styles handlers use
- `FakeSerialPort` — queue-backed read/write shims

Both make a real push→pull round-trip through a device's own byte layout testable — see
`handlers/moondrop-usb-hid.spec.ts`. FiiO's handler resolves through a 100 ms poll interval, so its
spec drives `vi.useFakeTimers()` and `advanceTimersByTimeAsync` rather than waiting in real time.

Feature detection reads `navigator.hid` / `.serial` / `.bluetooth` with the `in` operator, which
walks the prototype chain — **a test that hides a transport has to delete it from
`Navigator.prototype`**, not shadow it with `undefined` on the instance. See
`components/features/DevicePeq.svelte.spec.ts`, which also shows the connector-module mocking
pattern: the four connector modules and the registry get `vi.mock`ed rather than the run touching
real WebHID/WebSerial.

## Coverage

The ~25 modules under `handlers/` and `connectors/` are largely untested and count as 0% rather than
vanishing from the denominator — that's what `coverage.include` in `vite.config.ts` is for. Don't
"fix" the coverage number by excluding them.

ESLint reports unused-variable warnings here for protocol constants kept for reference. Those are
deliberate and do not fail the build.
