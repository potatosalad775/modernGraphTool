<script lang="ts">
  import { eqStore } from '$lib/stores/eq-store.svelte.js';
  import { frStore } from '$lib/stores/fr-store.svelte.js';
  import { Equalizer } from '$lib/utils/equalizer.js';
  import * as m from '$lib/paraglide/messages.js';

  let freqMin = $state(20);
  let freqMax = $state(15000);
  let qMin = $state(0.5);
  let qMax = $state(2.0);
  let gainMin = $state(-12);
  let gainMax = $state(12);
  let useShelfFilter = $state(true);
  let isRunning = $state(false);

  async function runAutoEQ() {
    const sourceUUID = eqStore.sourcePhoneUUID;
    const targetUUID = eqStore.autoEqTargetUUID;

    if (!sourceUUID || !targetUUID) {
      alert('Please select both a source device and target in the phone select above.');
      return;
    }

    const sourceData = frStore.get(sourceUUID);
    const targetData = frStore.get(targetUUID);

    if (!sourceData || !targetData) {
      alert('Source or target data not found.');
      return;
    }

    const getChannelData = (data: typeof sourceData) => {
      return data?.channels?.AVG?.data ?? data?.channels?.L?.data ?? data?.channels?.R?.data ?? [];
    };

    const sourcePoints = getChannelData(sourceData) as [number, number][];
    const targetPoints = getChannelData(targetData) as [number, number][];

    if (!sourcePoints.length || !targetPoints.length) {
      alert('Could not retrieve frequency response data.');
      return;
    }

    const maxFilters = Math.max(1, eqStore.filters.length);
    const options = {
      maxFilters,
      freqRange: [freqMin, freqMax] as [number, number],
      qRange: [qMin, qMax] as [number, number],
      gainRange: [gainMin, gainMax] as [number, number],
      useShelfFilter,
    };

    isRunning = true;
    try {
      const filters = await new Promise<import('$lib/utils/equalizer.js').EQFilter[]>(resolve => {
        requestAnimationFrame(() => {
          const eq = new Equalizer();
          resolve(eq.autoEQ(sourcePoints, targetPoints, options));
        });
      });
      eqStore.filters = filters;
    } catch (err) {
      console.error('AutoEQ failed:', err);
    } finally {
      isRunning = false;
    }
  }
</script>

<div class="flex flex-col gap-2 text-sm">
  <!-- Filter settings fieldset -->
  <fieldset class="rounded border border-base-content/15 px-3 py-2 border-base-content/15">
    <legend class="px-1 text-xs text-base-content/60">{m.extension_equalizer_autoeq_filter_setting()}</legend>
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        checked={useShelfFilter}
        onchange={(e) => (useShelfFilter = (e.target as HTMLInputElement).checked)}
        class="h-3 w-3 accent-accent"
      />
      <span class="text-xs">{m.extension_equalizer_autoeq_use_shelf_filter()}</span>
    </label>
  </fieldset>

  <!-- Frequency Range -->
  <fieldset class="rounded border border-base-content/15 px-3 py-2 border-base-content/15">
    <legend class="px-1 text-xs text-base-content/60">{m.extension_equalizer_autoeq_freq_range()}</legend>
    <div class="flex items-center gap-2">
      <span class="text-xs text-base-content/60">{m.extension_equalizer_autoeq_min()}</span>
      <input
        type="number"
        value={freqMin}
        min="20"
        max="20000"
        oninput={(e) => (freqMin = parseInt((e.target as HTMLInputElement).value) || freqMin)}
        class="w-20 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span class="text-xs text-base-content/60">{m.extension_equalizer_autoeq_max()}</span>
      <input
        type="number"
        value={freqMax}
        min="20"
        max="20000"
        oninput={(e) => (freqMax = parseInt((e.target as HTMLInputElement).value) || freqMax)}
        class="w-20 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  </fieldset>

  <!-- Q Range -->
  <fieldset class="rounded border border-base-content/15 px-3 py-2 border-base-content/15">
    <legend class="px-1 text-xs text-base-content/60">{m.extension_equalizer_autoeq_q_range()}</legend>
    <div class="flex items-center gap-2">
      <span class="text-xs text-base-content/60">{m.extension_equalizer_autoeq_min()}</span>
      <input
        type="number"
        value={qMin}
        min="0.1"
        max="10"
        step="0.1"
        oninput={(e) => (qMin = parseFloat((e.target as HTMLInputElement).value) || qMin)}
        class="w-20 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span class="text-xs text-base-content/60">{m.extension_equalizer_autoeq_max()}</span>
      <input
        type="number"
        value={qMax}
        min="0.1"
        max="10"
        step="0.1"
        oninput={(e) => (qMax = parseFloat((e.target as HTMLInputElement).value) || qMax)}
        class="w-20 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  </fieldset>

  <!-- Gain Range -->
  <fieldset class="rounded border border-base-content/15 px-3 py-2 border-base-content/15">
    <legend class="px-1 text-xs text-base-content/60">{m.extension_equalizer_autoeq_gain_range()}</legend>
    <div class="flex items-center gap-2">
      <span class="text-xs text-base-content/60">{m.extension_equalizer_autoeq_min()}</span>
      <input
        type="number"
        value={gainMin}
        min="-40"
        max="0"
        oninput={(e) => (gainMin = parseFloat((e.target as HTMLInputElement).value) ?? gainMin)}
        class="w-20 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span class="text-xs text-base-content/60">{m.extension_equalizer_autoeq_max()}</span>
      <input
        type="number"
        value={gainMax}
        min="0"
        max="40"
        oninput={(e) => (gainMax = parseFloat((e.target as HTMLInputElement).value) ?? gainMax)}
        class="w-20 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  </fieldset>

  <p class="text-xs text-base-content/60">{m.extension_equalizer_autoeq_description()}</p>

  <button
    onclick={runAutoEQ}
    disabled={isRunning}
    class="w-full rounded border border-base-content/20 bg-base-200 px-3 py-2 text-sm font-medium  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
  >
    {isRunning ? '...' : m.extension_equalizer_autoeq_run_button()}
  </button>
</div>
