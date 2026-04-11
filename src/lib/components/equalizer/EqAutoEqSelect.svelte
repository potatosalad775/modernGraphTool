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
    return opts;
  });

  $effect(() => {
    const uuids = new Set(targetOptions.map((o) => o.uuid));
    if (eqStore.autoEqTargetUUID && !uuids.has(eqStore.autoEqTargetUUID)) {
      eqStore.autoEqTargetUUID = null;
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
  <option value="">{m.extension_equalizer_phone_select_option_target()}</option>
  {#each targetOptions as opt (opt.uuid)}
    <option value={opt.uuid}>{opt.label}</option>
  {/each}
</select>
