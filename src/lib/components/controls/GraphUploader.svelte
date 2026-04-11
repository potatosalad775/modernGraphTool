<script lang="ts">
  import { dataProvider } from '$lib/services/data-provider.svelte.js';
  import FRParser from '$lib/utils/fr-parser.js';
  import { toast } from 'svelte-sonner';
  import * as m from '$lib/paraglide/messages.js';
	import Button from '../atoms/Button.svelte';
	import { FileUp } from '@lucide/svelte';

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
  <Button
    title={m.extension_equalizer_upload_fr()}
    onclick={() => phoneInputEl?.click()}
    variant="outline" size="sm"
    class="flex-1"
  >
    <FileUp class="size-3.5 mr-1.5" />
    {m.extension_equalizer_upload_fr()}
  </Button>
  <Button
    title={m.extension_equalizer_upload_target()}
    onclick={() => targetInputEl?.click()}
    variant="outline" size="sm"
    class="flex-1"
  >
    <FileUp class="size-3.5 mr-1.5" />
    {m.extension_equalizer_upload_target()}
  </Button>
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
