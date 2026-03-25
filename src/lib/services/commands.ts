import type { FRDataObject, FRColors, ParsedFRData, SampleChannelKey, HpTFDisplayKey } from '$lib/types/data-types.js';
import type { FRStoreWriteAPI } from './command-history.js';

/**
 * Command base interface:
 *   execute(store: FRStoreWriteAPI) → void
 *   undo(store: FRStoreWriteAPI)    → void
 *
 * All commands capture enough state to fully reverse their effect.
 * Commands operate only on the store — reactive effects are triggered
 * automatically by SvelteMap writes; no manual event dispatches needed.
 */
export interface Command {
  execute(store: FRStoreWriteAPI): void;
  undo(store: FRStoreWriteAPI): void;
  readonly uuid: string;
}

// ─── Add ─────────────────────────────────────────────────────────────────────

export class AddFRDataCommand implements Command {
  #frObject: FRDataObject;

  constructor(frObject: FRDataObject) {
    // Deep-copy so the command owns its data independently
    this.#frObject = structuredClone(frObject);
  }

  execute(store: FRStoreWriteAPI): void {
    store.set(this.#frObject.uuid, this.#frObject);
  }

  undo(store: FRStoreWriteAPI): void {
    store.delete(this.#frObject.uuid);
  }

  get uuid()       { return this.#frObject.uuid; }
  get sourceType() { return this.#frObject.type; }
  get identifier() { return this.#frObject.identifier; }
}

// ─── Remove ──────────────────────────────────────────────────────────────────

export class RemoveFRDataCommand implements Command {
  #uuid: string;
  #sourceType: string;
  #snapshot: FRDataObject | null = null;

  constructor(uuid: string, sourceType: string) {
    this.#uuid = uuid;
    this.#sourceType = sourceType;
  }

  execute(store: FRStoreWriteAPI): void {
    this.#snapshot = store.get(this.#uuid) ?? null; // clone saved before delete
    store.delete(this.#uuid);
  }

  undo(store: FRStoreWriteAPI): void {
    if (this.#snapshot) store.set(this.#uuid, this.#snapshot);
  }

  get uuid()       { return this.#uuid; }
  get sourceType() { return this.#sourceType; }
  get identifier() { return this.#snapshot?.identifier ?? ''; }
}

// ─── Update channel ───────────────────────────────────────────────────────────

export class UpdateDisplayChannelCommand implements Command {
  #uuid: string;
  #newChannel: ('L' | 'R' | 'AVG')[];
  #oldChannel: ('L' | 'R' | 'AVG')[] | null = null;

  constructor(uuid: string, newChannel: ('L' | 'R' | 'AVG')[]) {
    this.#uuid = uuid;
    this.#newChannel = [...newChannel];
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldChannel = [...data.dispChannel];
    store.set(this.#uuid, { ...data, dispChannel: this.#newChannel });
  }

  undo(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data || !this.#oldChannel) return;
    store.set(this.#uuid, { ...data, dispChannel: this.#oldChannel });
  }

  get uuid() { return this.#uuid; }
}

// ─── Update colors ────────────────────────────────────────────────────────────

export class UpdateColorsCommand implements Command {
  #uuid: string;
  #newColors: FRColors;
  #oldColors: FRColors | null = null;

  constructor(uuid: string, newColors: FRColors) {
    this.#uuid = uuid;
    this.#newColors = structuredClone(newColors);
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldColors = structuredClone(data.colors);
    store.set(this.#uuid, { ...data, colors: { ...data.colors, ...this.#newColors } });
  }

  undo(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data || !this.#oldColors) return;
    store.set(this.#uuid, { ...data, colors: this.#oldColors });
  }

  get uuid() { return this.#uuid; }
}

// ─── Update dash ─────────────────────────────────────────────────────────────

export class UpdateDashPatternCommand implements Command {
  #uuid: string;
  #newDash: string;
  #oldDash: string | null = null;

  constructor(uuid: string, newDash: string) {
    this.#uuid = uuid;
    this.#newDash = newDash;
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldDash = data.dash;
    store.set(this.#uuid, { ...data, dash: this.#newDash });
  }

  undo(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data || this.#oldDash === null) return;
    store.set(this.#uuid, { ...data, dash: this.#oldDash });
  }

  get uuid() { return this.#uuid; }
}

// ─── Update visibility ───────────────────────────────────────────────────────

export class UpdateVisibilityCommand implements Command {
  #uuid: string;
  #hidden: boolean;
  #oldHidden: boolean | null = null;

  constructor(uuid: string, hidden: boolean) {
    this.#uuid = uuid;
    this.#hidden = hidden;
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldHidden = data.hidden ?? false;
    store.set(this.#uuid, { ...data, hidden: this.#hidden });
  }

  undo(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data || this.#oldHidden === null) return;
    store.set(this.#uuid, { ...data, hidden: this.#oldHidden });
  }

  get uuid()   { return this.#uuid; }
  get hidden() { return this.#hidden; }
}

// ─── Update variant ──────────────────────────────────────────────────────────

export class UpdateVariantCommand implements Command {
  #uuid: string;
  #newChannels: ParsedFRData;
  #newDispSuffix: string;
  #newDispChannel: ('L' | 'R' | 'AVG')[];
  #snapshot: FRDataObject | null = null;

  constructor(uuid: string, newChannels: ParsedFRData, newDispSuffix: string, newDispChannel: ('L' | 'R' | 'AVG')[]) {
    this.#uuid = uuid;
    this.#newChannels = structuredClone(newChannels);
    this.#newDispSuffix = newDispSuffix;
    this.#newDispChannel = [...newDispChannel];
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#snapshot = structuredClone(data);
    store.set(this.#uuid, {
      ...data,
      channels: this.#newChannels,
      dispSuffix: this.#newDispSuffix,
      dispChannel: this.#newDispChannel,
    });
  }

  undo(store: FRStoreWriteAPI): void {
    if (this.#snapshot) store.set(this.#uuid, this.#snapshot);
  }

  get uuid() { return this.#uuid; }
}

// ─── Update raw FR data (equalizer / external processors) ───────────────────

export class UpdateFRDataWithRawDataCommand implements Command {
  #uuid: string;
  #newData: FRDataObject;
  #snapshot: FRDataObject | null = null;

  constructor(uuid: string, newData: FRDataObject) {
    this.#uuid = uuid;
    this.#newData = structuredClone(newData);
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#snapshot = structuredClone(data);
    store.set(this.#uuid, this.#newData);
  }

  undo(store: FRStoreWriteAPI): void {
    if (this.#snapshot) store.set(this.#uuid, this.#snapshot);
  }

  get uuid() { return this.#uuid; }
}

// ─── Update sample display ───────────────────────────────────────────────────

export class UpdateSampleDisplayCommand implements Command {
  #uuid: string;
  #newDispSamples: SampleChannelKey[];
  #oldDispSamples: SampleChannelKey[] | null = null;

  constructor(uuid: string, newDispSamples: SampleChannelKey[]) {
    this.#uuid = uuid;
    this.#newDispSamples = [...newDispSamples];
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldDispSamples = data.dispSamples ? [...data.dispSamples] : [];
    store.set(this.#uuid, { ...data, dispSamples: this.#newDispSamples });
  }

  undo(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data || !this.#oldDispSamples) return;
    store.set(this.#uuid, { ...data, dispSamples: this.#oldDispSamples });
  }

  get uuid() { return this.#uuid; }
}

// ─── Update HpTF display ─────────────────────────────────────────────────────

export class UpdateHpTFDisplayCommand implements Command {
  #uuid: string;
  #newDispHptf: HpTFDisplayKey[];
  #newFillVisible: boolean;
  #oldDispHptf: HpTFDisplayKey[] | null = null;
  #oldFillVisible: boolean | null = null;

  constructor(uuid: string, dispHptf: HpTFDisplayKey[], fillVisible: boolean) {
    this.#uuid = uuid;
    this.#newDispHptf = [...dispHptf];
    this.#newFillVisible = fillVisible;
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldDispHptf = data.dispHptf ? [...data.dispHptf] : [];
    this.#oldFillVisible = data.hptfFillVisible ?? false;
    store.set(this.#uuid, {
      ...data,
      dispHptf: this.#newDispHptf,
      hptfFillVisible: this.#newFillVisible
    });
  }

  undo(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data || this.#oldDispHptf === null) return;
    store.set(this.#uuid, {
      ...data,
      dispHptf: this.#oldDispHptf,
      hptfFillVisible: this.#oldFillVisible ?? false
    });
  }

  get uuid() { return this.#uuid; }
}

// ─── Update y-offset ──────────────────────────────────────────────────────────

export class UpdateYOffsetCommand implements Command {
  #uuid: string;
  #newOffset: number;
  #oldOffset: number | null = null;

  constructor(uuid: string, newOffset: number) {
    this.#uuid = uuid;
    this.#newOffset = newOffset;
  }

  execute(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldOffset = data.yOffset ?? 0;
    store.set(this.#uuid, { ...data, yOffset: this.#newOffset });
  }

  undo(store: FRStoreWriteAPI): void {
    const data = store.get(this.#uuid);
    if (!data || this.#oldOffset === null) return;
    store.set(this.#uuid, { ...data, yOffset: this.#oldOffset });
  }

  get uuid() { return this.#uuid; }
}
