<script lang="ts">
	import { configEditor } from './config-store.svelte';
	import { formStateToConfigString } from '../../../utils/configConverter';

	let showPreview = $state(false);
	let copied = $state(false);

	/*
	 * `$derived` replaces the React `useMemo`. Because `$state` is deeply
	 * reactive, this re-runs on any field edit anywhere in the form without the
	 * dependency array the memo needed — which had to be the whole state object,
	 * and so recomputed on every keystroke anyway.
	 */
	let output = $derived(formStateToConfigString(configEditor.config));

	function handleDownload() {
		const blob = new Blob([output], { type: 'application/javascript' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'config.js';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(output);
		} catch {
			// Fallback
			const textarea = document.createElement('textarea');
			textarea.value = output;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div>
	<div class="ceExportBar">
		<button type="button" class="ceBtn ceBtnPrimary" onclick={handleDownload}>
			Download config.js
		</button>
		<button type="button" class="ceBtn" onclick={handleCopy}>
			{copied ? 'Copied!' : 'Copy to clipboard'}
		</button>
		<button type="button" class="ceBtn" onclick={() => (showPreview = !showPreview)}>
			{showPreview ? 'Hide preview' : 'Preview output'}
		</button>
	</div>

	{#if showPreview}
		<div class="ceExportPreview">
			<textarea
				class="ceExportTextarea"
				aria-label="Generated config.js"
				value={output}
				readonly
				spellcheck="false"></textarea>
		</div>
	{/if}
</div>
