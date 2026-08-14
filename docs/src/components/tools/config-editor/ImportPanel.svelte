<script lang="ts">
	import { configEditor } from './config-store.svelte';
	import {
		parseV2Config,
		parseV1Config,
		parseV1Extensions,
		parseCrinGraphConfig,
		convertV1ToV2,
		convertCrinGraphToV2,
		configToFormState
	} from '../../../utils/configConverter';

	type ImportTab = 'v2' | 'v1' | 'crin';

	const TABS: Array<{ id: ImportTab; label: string; placeholder: string }> = [
		{ id: 'v2', label: 'Import v2', placeholder: 'Paste your v2 config.js content here...' },
		{ id: 'v1', label: 'Convert v1', placeholder: 'Paste your v1 config.js content here...' },
		{
			id: 'crin',
			label: 'Convert CrinGraph',
			placeholder: 'Paste your CrinGraph config.js content here...'
		}
	];

	let activeTab = $state<ImportTab>('v2');
	let input = $state('');
	let v1Extensions = $state('');
	let error = $state<string | null>(null);
	let warnings = $state<string[]>([]);
	let success = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	let activePlaceholder = $derived(TABS.find((t) => t.id === activeTab)!.placeholder);

	function clearMessages() {
		error = null;
		warnings = [];
		success = null;
	}

	function selectTab(tab: ImportTab) {
		activeTab = tab;
		clearMessages();
	}

	function loadDefaults() {
		clearMessages();
		configEditor.reset();
		input = '';
		v1Extensions = '';
		success = 'Loaded default configuration.';
	}

	function handleImport() {
		clearMessages();
		if (!input.trim()) {
			const kind = activeTab === 'v2' ? 'v2' : activeTab === 'v1' ? 'v1' : 'CrinGraph';
			error = `Please paste your ${kind} config.js content.`;
			return;
		}
		try {
			if (activeTab === 'v2') {
				configEditor.load(configToFormState(parseV2Config(input)));
				success = 'Config imported successfully. Edit the fields below and export when ready.';
				return;
			}

			// Both conversions round-trip through the emitted v2 string rather than
			// building form state directly, so the import path exercises the same
			// parser an operator's own file would.
			const result =
				activeTab === 'v1'
					? convertV1ToV2(
							parseV1Config(input),
							v1Extensions.trim() ? parseV1Extensions(v1Extensions) : null
						)
					: convertCrinGraphToV2(parseCrinGraphConfig(input));

			warnings = result.warnings;
			configEditor.load(configToFormState(parseV2Config(result.output)));
			success =
				activeTab === 'v1'
					? 'v1 config converted and imported. Review the settings below.'
					: 'CrinGraph config converted and imported. Review the settings below.';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function handleFileUpload(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			input = reader.result as string;
		};
		reader.readAsText(file);
		// Reset file input so re-uploading the same file triggers change
		if (fileInput) fileInput.value = '';
	}
</script>

<div class="ceImportPanel">
	<div class="ceImportTabs">
		{#each TABS as tab (tab.id)}
			<button
				type="button"
				class="ceImportTab"
				class:ceImportTabActive={activeTab === tab.id}
				onclick={() => selectTab(tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div class="ceImportContent">
		<textarea
			class="ceImportTextarea"
			placeholder={activePlaceholder}
			aria-label={activePlaceholder}
			bind:value={input}
			spellcheck="false"></textarea>

		{#if activeTab === 'v1'}
			<textarea
				class="ceImportTextarea"
				placeholder="Paste your v1 extensions.config.js content here (optional)..."
				aria-label="v1 extensions.config.js content"
				bind:value={v1Extensions}
				spellcheck="false"
				style="min-height: 120px;"></textarea>
		{/if}

		<div class="ceImportActions">
			<button type="button" class="ceBtn ceBtnPrimary" onclick={handleImport}>
				{activeTab === 'v2' ? 'Import' : 'Convert & Import'}
			</button>
			<label class="ceImportFileLabel">
				Upload file
				<input
					bind:this={fileInput}
					type="file"
					accept=".js,.txt"
					class="ceImportFileInput"
					onchange={handleFileUpload}
				/>
			</label>
			<button type="button" class="ceBtn" onclick={loadDefaults}>Start Fresh</button>
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
