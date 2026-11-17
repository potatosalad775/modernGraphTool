<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-cdn-mode"
	title="CDN Mode"
	description="CDN deployment settings. Only used when deploying with cdn-index.html — leave disabled for standard dist/ deployments. If your site is not at the root of its (sub)domain (e.g. example.com/headphones/), set Base Path below or share links will 404."
	learnMoreHref="./guide-for-admins/deployment/cdn"
	optional
	bind:enabled={config.CDN_MODE_ENABLED}
>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-major">Major Version</label>
		<input
			id="{id}-major"
			type="number"
			class="ceInput ceInputSmall"
			bind:value={config.CDN_MODE.MAJOR_VERSION}
			min="1"
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-base-path">
			Base Path
			<span class="ceLabelHint">required for subdirectory deploys</span>
		</label>
		<input
			id="{id}-base-path"
			type="text"
			class="ceInput"
			bind:value={config.CDN_MODE.BASE_PATH}
			placeholder="/headphones"
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-base">
			Custom Base URL
			<span class="ceLabelHint">optional, advanced</span>
		</label>
		<input
			id="{id}-base"
			type="text"
			class="ceInput"
			bind:value={config.CDN_MODE.BASE}
			placeholder="https://cdn.jsdelivr.net/gh/..."
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-versions">
			Versions URL
			<span class="ceLabelHint">optional, advanced</span>
		</label>
		<input
			id="{id}-versions"
			type="text"
			class="ceInput"
			bind:value={config.CDN_MODE.VERSIONS_URL}
			placeholder="https://raw.githubusercontent.com/.../versions.json"
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-version">
			Exact version (pins one release)
			<span class="ceLabelHint">optional — stops automatic updates, wins over Major Version</span>
		</label>
		<input
			id="{id}-version"
			type="text"
			class="ceInput ceInputSmall"
			bind:value={config.CDN_MODE.VERSION}
			placeholder="2.3.4"
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-boot-integrity">
			Boot integrity
			<span class="ceLabelHint">
				optional — needs an exact version; the value comes from pins.json (see "Pinning a release"
				in the CDN deployment guide)
			</span>
		</label>
		<input
			id="{id}-boot-integrity"
			type="text"
			class="ceInput"
			bind:value={config.CDN_MODE.BOOT_INTEGRITY}
			placeholder="sha384-…"
		/>
	</div>
</AccordionSection>
