<script lang="ts">
  import { frStore } from '$lib/stores/fr-store.svelte.js';
  import { eqStore } from '$lib/stores/eq-store.svelte.js';
  import * as m from '$lib/paraglide/messages.js';

  const sourceOptions = $derived.by(() => {
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
    // Sort phones first, then targets, all alphabetically by label
    return opts.sort((a, b) => {
      const itemA = frStore.get(a.uuid);
      const itemB = frStore.get(b.uuid);
      if (!itemA || !itemB) return 0;
      if (itemA.type === 'phone' && itemB.type !== 'phone') return -1;
      if (itemA.type !== 'phone' && itemB.type === 'phone') return 1;
      return a.label.localeCompare(b.label);
    });
  });

  $effect(() => {
    const uuids = new Set(sourceOptions.map((o) => o.uuid));
    if (eqStore.sourcePhoneUUID && !uuids.has(eqStore.sourcePhoneUUID)) {
      eqStore.sourcePhoneUUID = null;
    }
    if (eqStore.sourcePhoneUUID === null) {
      const phones: string[] = [];
      for (const [, item] of frStore.entries) {
        if (item.type === 'phone' || item.type === 'inserted-phone') phones.push(item.uuid);
      }
      if (phones.length === 1) eqStore.sourcePhoneUUID = phones[0];
    }
  });
</script>

<select
  value={eqStore.sourcePhoneUUID ?? ''}
  onchange={(e) => {
    eqStore.sourcePhoneUUID = (e.target as HTMLSelectElement).value || null;
  }}
  class="flex-1 rounded min-w-16 border border-base-content/20 bg-base-100 px-2 py-1 text-sm hover:bg-base-content/5 hover:cursor-pointer"
>
  <option value="">{m.equalizer_phone_select_option_source()}</option>
  {#each sourceOptions as opt (opt.uuid)}
    <option value={opt.uuid}>{opt.label}</option>
  {/each}
</select>
