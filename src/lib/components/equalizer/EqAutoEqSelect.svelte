<script lang="ts">
  import { frStore } from '$lib/stores/fr-store.svelte.js';
  import { eqStore } from '$lib/stores/eq-store.svelte.js';
  import * as m from '$lib/paraglide/messages.js';

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
    // Sort targets first, then phones, all alphabetically by label
    return opts.sort((a, b) => {
      const itemA = frStore.get(a.uuid);
      const itemB = frStore.get(b.uuid);
      if (!itemA || !itemB) return 0;
      if (itemA.type === 'target' && itemB.type !== 'target') return -1;
      if (itemA.type !== 'target' && itemB.type === 'target') return 1;
      return a.label.localeCompare(b.label);
    });
  });

  $effect(() => {
    const uuids = new Set(targetOptions.map((o) => o.uuid));
    if (eqStore.autoEqTargetUUID && !uuids.has(eqStore.autoEqTargetUUID)) {
      eqStore.autoEqTargetUUID = null;
    }
    if (eqStore.autoEqTargetUUID === null) {
      const targets: string[] = [];
      for (const [, item] of frStore.entries) {
        if (item.type === 'target' || item.type === 'inserted-target') targets.push(item.uuid);
      }
      if (targets.length === 1) eqStore.autoEqTargetUUID = targets[0];
    }
  });
</script>

<select
  value={eqStore.autoEqTargetUUID ?? ''}
  onchange={(e) => {
    eqStore.autoEqTargetUUID = (e.target as HTMLSelectElement).value || null;
  }}
  class="w-full rounded border border-base-content/20 px-2 py-1 text-sm cursor-pointer"
>
  <option value="">{m.equalizer_phone_select_option_target()}</option>
  {#each targetOptions as opt (opt.uuid)}
    <option value={opt.uuid}>{opt.label}</option>
  {/each}
</select>
