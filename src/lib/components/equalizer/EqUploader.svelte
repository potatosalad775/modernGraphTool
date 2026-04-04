<script lang="ts">
  import { dataProvider } from '$lib/services/data-provider.svelte.js';
  import FRParser from '$lib/utils/fr-parser.js';
  import { toast } from 'svelte-sonner';
  import * as m from '$lib/paraglide/messages.js';

  let phoneInputEl = $state<HTMLInputElement | undefined>(undefined);
  let targetInputEl = $state<HTMLInputElement | undefined>(undefined);

  async function handleUpload(e: Event, sourceType: 'phone' | 'target') {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const rawData = await file.text();
      const parsed = await FRParser.parseFRData(rawData);
      const filename = file.name.replace(/\.[^/.]+$/, '');
      await dataProvider.insertRawFRData(sourceType, filename, { AVG: parsed }, { dispSuffix: 'Uploaded', dispChannel: ['AVG'] });
      toast.success(`Loaded ${filename}`);
    } catch (err) {
      console.error('EqUploader: failed to upload', err);
      toast.error('Failed to load file', { description: err instanceof Error ? err.message : 'Invalid format' });
    } finally {
      input.value = '';
    }
  }
</script>

<div class="flex gap-2">
  <button
    onclick={() => phoneInputEl?.click()}
    class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content/60 hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  >
    {m.extension_equalizer_upload_fr()}
  </button>
  <button
    onclick={() => targetInputEl?.click()}
    class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content/60 hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  >
    {m.extension_equalizer_upload_target()}
  </button>
  <input
    bind:this={phoneInputEl}
    type="file"
    accept=".txt"
    class="hidden"
    onchange={(e) => handleUpload(e, 'phone')}
  />
  <input
    bind:this={targetInputEl}
    type="file"
    accept=".txt"
    class="hidden"
    onchange={(e) => handleUpload(e, 'target')}
  />
</div>
