<script lang="ts">
	import { serializePhoneBook } from '../../../utils/phoneBookConverter';
	import { phoneBook } from './phone-book-store.svelte';

	let showPreview = $state(false);
	let copied = $state(false);

	let output = $derived(serializePhoneBook(phoneBook.book));

	function handleDownload() {
		const blob = new Blob([output], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'phone_book.json';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(output);
		} catch {
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
			Download phone_book.json
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
				aria-label="Generated phone_book.json"
				value={output}
				readonly
				spellcheck="false"></textarea>
		</div>
	{/if}
</div>
