<script lang="ts">
  import { frStore } from '$lib/stores/fr-store.svelte.js';
  import { eqStore } from '$lib/stores/eq-store.svelte.js';
  import * as m from '$lib/paraglide/messages.js';
  import type { FRDataObject } from '$lib/types/data-types.js';

  // ---------------------------------------------------------------------------
  // Derived option lists
  // ---------------------------------------------------------------------------

  const sourceOptions = $derived.by(() => {
    const _size = frStore.size;
    const opts: { uuid: string; label: string }[] = [];
    for (const [, item] of frStore.entries) {
      if (item.type === 'phone' || item.type === 'inserted-phone') {
        opts.push({
          uuid: item.uuid,
          label: `${item.identifier} ${item.dispSuffix || ''}`.trim(),
        });
      }
    }
    return opts;
  });

  const targetOptions = $derived.by(() => {
    const _size = frStore.size;
    const opts: { uuid: string; label: string }[] = [];
    for (const [, item] of frStore.entries) {
      if (item.type !== 'eq' && item.type !== 'inserted-eq') {
        opts.push({
          uuid: item.uuid,
          label: `${item.identifier} ${item.dispSuffix || ''}`.trim(),
        });
      }
    }
    return opts;
  });

  // ---------------------------------------------------------------------------
  // Reset selections when the referenced item is removed from frStore
  // ---------------------------------------------------------------------------

  $effect(() => {
    const uuids = new Set(sourceOptions.map((o) => o.uuid));
    if (eqStore.sourcePhoneUUID && !uuids.has(eqStore.sourcePhoneUUID)) {
      eqStore.sourcePhoneUUID = null;
    }
  });

  $effect(() => {
    const uuids = new Set(targetOptions.map((o) => o.uuid));
    if (eqStore.autoEqTargetUUID && !uuids.has(eqStore.autoEqTargetUUID)) {
      eqStore.autoEqTargetUUID = null;
    }
  });
</script>

<div class="flex flex-col gap-2">
  <!-- Source device to EQ -->
  <select
    value={eqStore.sourcePhoneUUID ?? ''}
    onchange={(e) => {
      eqStore.sourcePhoneUUID = (e.target as HTMLSelectElement).value || null;
    }}
    class="w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-sm"
  >
    <option value="">{m.extension_equalizer_phone_select_option_source()}</option>
    {#each sourceOptions as opt (opt.uuid)}
      <option value={opt.uuid}>{opt.label}</option>
    {/each}
  </select>

  <!-- Target for AutoEQ -->
  <select
    value={eqStore.autoEqTargetUUID ?? ''}
    onchange={(e) => {
      eqStore.autoEqTargetUUID = (e.target as HTMLSelectElement).value || null;
    }}
    class="w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-sm"
  >
    <option value="">{m.extension_equalizer_phone_select_option_target()}</option>
    {#each targetOptions as opt (opt.uuid)}
      <option value={opt.uuid}>{opt.label}</option>
    {/each}
  </select>
</div>
