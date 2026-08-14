<script lang="ts">
	import { parsePhoneBook } from '../../../utils/phoneBookConverter';
	import { phoneBook } from './phone-book-store.svelte';

	let input = $state('');
	let error = $state<string | null>(null);
	let warnings = $state<string[]>([]);
	let success = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	function clearMessages() {
		error = null;
		warnings = [];
		success = null;
	}

	function handleImport() {
		clearMessages();
		if (!input.trim()) {
			error = 'Please paste your phone_book.json content.';
			return;
		}
		try {
			const result = parsePhoneBook(input);
			phoneBook.load(result.state);
			warnings = result.warnings;
			success = `Imported ${result.state.length} brand(s). Edit below and export when ready.`;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function handleReset() {
		clearMessages();
		phoneBook.reset();
		input = '';
		success = 'Started a fresh phone_book.';
	}

	function handleFileUpload(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			input = reader.result as string;
		};
		reader.readAsText(file);
		if (fileInput) fileInput.value = '';
	}
</script>

<div class="ceImportPanel">
	<div class="ceImportContent">
		<textarea
			class="ceImportTextarea"
			placeholder="Paste your phone_book.json content here, or upload a file..."
			aria-label="phone_book.json content"
			bind:value={input}
			spellcheck="false"></textarea>

		<div class="ceImportActions">
			<button type="button" class="ceBtn ceBtnPrimary" onclick={handleImport}>Import</button>
			<label class="ceImportFileLabel">
				Upload file
				<input
					bind:this={fileInput}
					type="file"
					accept=".json"
					class="ceImportFileInput"
					onchange={handleFileUpload}
				/>
			</label>
			<button type="button" class="ceBtn" onclick={handleReset}>Start Fresh</button>
		</div>

		{#if error}
			<div class="ceError">{error}</div>
		{/if}
		{#if warnings.length > 0}
			<div class="ceWarnings">
				<strong>Warnings:</strong>
				<ul>
					{#each warnings as w, i (i)}
						<li>{w}</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if success}
			<div class="ceSuccess">{success}</div>
		{/if}
	</div>
</div>
