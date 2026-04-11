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
    return opts;
  });

  $effect(() => {
    const uuids = new Set(sourceOptions.map((o) => o.uuid));
    if (eqStore.sourcePhoneUUID && !uuids.has(eqStore.sourcePhoneUUID)) {
      eqStore.sourcePhoneUUID = null;
    }
  });
</script>

<select
  value={eqStore.sourcePhoneUUID ?? ''}
  onchange={(e) => {
    eqStore.sourcePhoneUUID = (e.target as HTMLSelectElement).value || null;
  }}
  class="flex-1 rounded min-w-16 border border-base-content/20 bg-base-200 px-2 py-1 text-sm"
>
  <option value="">{m.extension_equalizer_phone_select_option_source()}</option>
  {#each sourceOptions as opt (opt.uuid)}
    <option value={opt.uuid}>{opt.label}</option>
  {/each}
</select>
