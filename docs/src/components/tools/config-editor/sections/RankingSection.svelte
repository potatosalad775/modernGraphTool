<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-ranking"
	title="Ranking"
	description="Links the rank shown on an expanded device row to your ranking page — and, optionally, reads the ranks themselves from a published spreadsheet instead of phone_book.json."
	learnMoreHref="./guide-for-admins/customize-page#ranking"
	optional
	bind:enabled={config.RANKING_ENABLED}
>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-url">
			Link URL
			<span class="ceLabelHint">
				placeholders: {'{type}'}
				{'{brand}'}
				{'{model}'}
				{'{slug}'}
				{'{fullName}'} — a URL with none is used as-is
			</span>
		</label>
		<input
			id="{id}-url"
			class="ceInput"
			type="text"
			placeholder="/ranking/?type={'{type}'}#{'{slug}'}"
			bind:value={config.RANKING.URL}
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-type">
			Device type
			<span class="ceLabelHint">
				the squigRanking "types" key this deploy measures — phone_book.json records no type, so a
				headphone site has to say so here
			</span>
		</label>
		<input
			id="{id}-type"
			class="ceInput"
			type="text"
			placeholder="earphone"
			bind:value={config.RANKING.TYPE}
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-config-url">
			squigRanking config URL
			<span class="ceLabelHint">
				optional — reads the sheet and its grade scale from a ranking page, so grades stay defined
				in one place. Leave empty to keep using phone_book.json scores.
			</span>
		</label>
		<input
			id="{id}-config-url"
			class="ceInput"
			type="text"
			placeholder="/ranking/ranking-config.js"
			bind:value={config.RANKING.CONFIG_URL}
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-display">
			Display
			<span class="ceLabelHint">auto uses a badge where the scale names the value, else stars</span>
		</label>
		<select id="{id}-display" class="ceSelect" bind:value={config.RANKING.DISPLAY}>
			<option value="auto">Auto</option>
			<option value="badge">Badge</option>
			<option value="stars">Stars</option>
			<option value="text">Plain text</option>
		</select>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-match">
			Row matching
			<span class="ceLabelHint">
				loose also matches partial device names — more matches, and more wrong ones
			</span>
		</label>
		<select id="{id}-match" class="ceSelect" bind:value={config.RANKING.MATCH}>
			<option value="strict">Strict (exact name)</option>
			<option value="loose">Loose (partial name)</option>
		</select>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-cache-ttl">
			Sheet cache
			<span class="ceLabelHint">seconds before an edited sheet is read again</span>
		</label>
		<input
			id="{id}-cache-ttl"
			class="ceInput"
			type="number"
			min="0"
			step="60"
			bind:value={config.RANKING.CACHE_TTL}
		/>
	</div>

	<div class="ceSectionDescription">
		Using a plain CSV with no squigRanking page? That needs a <code>SOURCE</code> block, which this
		editor does not generate — copy one from the
		<a href="./guide-for-admins/customize-page#ranking">RANKING documentation</a> into the exported config.
	</div>
</AccordionSection>
