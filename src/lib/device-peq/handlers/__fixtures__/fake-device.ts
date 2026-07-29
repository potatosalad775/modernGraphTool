/**
 * Fakes for exercising device handlers without hardware.
 *
 * Handlers talk to exactly two shapes: a WebHID `HIDDevice` (sendReport out,
 * `inputreport` events back) and the serial read/write shims a connector hangs
 * off `ConnectedDevice`. Both are small enough to stand in for faithfully,
 * which is what makes push→pull round-trips through a device's own byte layout
 * testable at all.
 */
import type { ConnectedDevice, DeviceHandler, DeviceModelConfig, DeviceSlot } from '../../types.js';

// ── WebHID ───────────────────────────────────────────────────────────────────

export interface SentReport {
	reportId: number;
	data: Uint8Array;
}

type Responder = (report: SentReport) => Uint8Array | Uint8Array[] | null | undefined;

export class FakeHidDevice {
	readonly sent: SentReport[] = [];
	/** Called for every outgoing report; return the bytes to feed back, if any. */
	respond: Responder = () => null;
	/** Handlers are split between `addEventListener` and this property form. */
	oninputreport: ((event: HIDInputReportEvent) => void) | null = null;

	#listeners = new Set<(event: HIDInputReportEvent) => void>();

	addEventListener(type: string, fn: (event: HIDInputReportEvent) => void): void {
		if (type === 'inputreport') this.#listeners.add(fn);
	}

	removeEventListener(type: string, fn: (event: HIDInputReportEvent) => void): void {
		if (type === 'inputreport') this.#listeners.delete(fn);
	}

	async sendReport(reportId: number, data: BufferSource): Promise<void> {
		const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
		// Copy: handlers reuse packet buffers, and a recorded report must not
		// change under the test after the fact.
		const report = { reportId, data: new Uint8Array(bytes) };
		this.sent.push(report);

		const reply = this.respond(report);
		if (!reply) return;
		for (const packet of Array.isArray(reply) ? reply : [reply]) {
			this.dispatch(packet);
		}
	}

	/** Deliver an inputreport to every registered listener. */
	dispatch(packet: Uint8Array): void {
		// `packet.buffer` must hold exactly the report: handlers read it back with
		// `new Uint8Array(event.data.buffer)`.
		const event = { data: { buffer: packet.buffer } } as unknown as HIDInputReportEvent;
		for (const listener of [...this.#listeners]) listener(event);
		this.oninputreport?.(event);
	}

	get listenerCount(): number {
		return this.#listeners.size;
	}

	reportsMatching(predicate: (report: SentReport) => boolean): SentReport[] {
		return this.sent.filter(predicate);
	}
}

// ── Serial ───────────────────────────────────────────────────────────────────

/** Queue-backed stand-in for the read/write shims a serial connector provides. */
export class FakeSerialPort {
	readonly written: Uint8Array[] = [];
	#queue: Uint8Array[] = [];

	readonly writable = {
		write: async (data: Uint8Array): Promise<void> => {
			this.written.push(new Uint8Array(data));
		}
	};

	readonly readable = {
		read: async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
			const value = this.#queue.shift();
			if (!value) return { done: true, value: undefined };
			return { done: false, value };
		}
	};

	/** Queue bytes for the handler's next read(s). */
	queue(...chunks: Uint8Array[]): void {
		this.#queue.push(...chunks);
	}

	/** Queue a JSON document terminated the way the device would send it. */
	queueJson(doc: unknown): void {
		this.queue(new TextEncoder().encode(JSON.stringify(doc) + '\0'));
	}

	/** Decode a written payload, dropping the trailing null terminator. */
	writtenJson(index = 0): Record<string, unknown> {
		const text = new TextDecoder().decode(this.written[index]);
		return JSON.parse(text.replace(/\0+$/, ''));
	}
}

// ── ConnectedDevice ──────────────────────────────────────────────────────────

export const BASE_MODEL_CONFIG: DeviceModelConfig = {
	minGain: -12,
	maxGain: 12,
	maxFilters: 8,
	firstWritableEQSlot: 0,
	maxWritableEQSlots: 1,
	disconnectOnSave: false,
	disabledPresetId: -1,
	experimental: false,
	availableSlots: [{ id: 0, name: 'Slot 1' }] as DeviceSlot[]
};

export function connectedDevice(
	rawDevice: unknown,
	modelConfig: Partial<DeviceModelConfig> = {},
	extra: Partial<ConnectedDevice> = {}
): ConnectedDevice {
	return {
		rawDevice: rawDevice as ConnectedDevice['rawDevice'],
		manufacturer: 'Test',
		model: 'Test Device',
		handler: {} as DeviceHandler,
		modelConfig: { ...BASE_MODEL_CONFIG, ...modelConfig },
		connectionType: 'hid',
		...extra
	};
}
