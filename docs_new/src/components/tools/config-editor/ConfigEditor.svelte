<script lang="ts">
	import './config-editor.css';

	import ImportPanel from './ImportPanel.svelte';
	import ExportBar from './ExportBar.svelte';

	import InitialSection from './sections/InitialSection.svelte';
	import NormalizationSection from './sections/NormalizationSection.svelte';
	import VisualizationSection from './sections/VisualizationSection.svelte';
	import InterfaceSection from './sections/InterfaceSection.svelte';
	import UrlSection from './sections/UrlSection.svelte';
	import CdnModeSection from './sections/CdnModeSection.svelte';
	import LanguageSection from './sections/LanguageSection.svelte';
	import PathSection from './sections/PathSection.svelte';
	import WatermarkSection from './sections/WatermarkSection.svelte';
	import TargetManifestSection from './sections/TargetManifestSection.svelte';
	import SamplesSection from './sections/SamplesSection.svelte';
	import TraceStylingSection from './sections/TraceStylingSection.svelte';
	import TopbarSection from './sections/TopbarSection.svelte';
	import PreferenceBoundSection from './sections/PreferenceBoundSection.svelte';
	import TargetCustomizerSection from './sections/TargetCustomizerSection.svelte';
	import CrossSiteSearchSection from './sections/CrossSiteSearchSection.svelte';
	import SiteSelectorSection from './sections/SiteSelectorSection.svelte';
	import DownloadSection from './sections/DownloadSection.svelte';
	import EqualizerSection from './sections/EqualizerSection.svelte';
	import SquiglinkSection from './sections/SquiglinkSection.svelte';
	import DescriptionSection from './sections/DescriptionSection.svelte';

	/** Must stay in the same order as the sections rendered below. */
	const SECTIONS = [
		{ id: 'section-initial', label: 'Initial Settings' },
		{ id: 'section-normalization', label: 'Normalization' },
		{ id: 'section-visualization', label: 'Visualization' },
		{ id: 'section-interface', label: 'Interface' },
		{ id: 'section-url', label: 'URL' },
		{ id: 'section-cdn-mode', label: 'CDN Mode' },
		{ id: 'section-language', label: 'Language' },
		{ id: 'section-path', label: 'Path' },
		{ id: 'section-watermark', label: 'Watermark' },
		{ id: 'section-target-manifest', label: 'Target Manifest' },
		// `SAMPLES` replaced the separate `MULTI_SAMPLE` and `HPTF` sections, which the
		// editor now only reads on import — it never writes them back.
		{ id: 'section-samples', label: 'Samples' },
		{ id: 'section-trace-styling', label: 'Trace Styling' },
		{ id: 'section-topbar', label: 'Topbar' },
		{ id: 'section-preference-bound', label: 'Preference Bound' },
		{ id: 'section-target-customizer', label: 'Target Customizer' },
		{ id: 'section-cross-site-search', label: 'Cross-Site Search' },
		{ id: 'section-site-selector', label: 'Site Selector' },
		{ id: 'section-download', label: 'Download' },
		{ id: 'section-equalizer', label: 'Equalizer' },
		{ id: 'section-squiglink', label: 'squig.link' },
		{ id: 'section-description', label: 'Description' }
	];

	function scrollTo(id: string) {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="ceContainer">
	<ImportPanel />

	<div class="ceLayout">
		<nav class="ceNav">
			<ul class="ceNavList">
				{#each SECTIONS as { id, label } (id)}
					<li class="ceNavItem">
						<button type="button" onclick={() => scrollTo(id)}>{label}</button>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="ceMain">
			<InitialSection />
			<NormalizationSection />
			<VisualizationSection />
			<InterfaceSection />
			<UrlSection />
			<CdnModeSection />
			<LanguageSection />
			<PathSection />
			<WatermarkSection />
			<TargetManifestSection />
			<SamplesSection />
			<TraceStylingSection />
			<TopbarSection />
			<PreferenceBoundSection />
			<TargetCustomizerSection />
			<CrossSiteSearchSection />
			<SiteSelectorSection />
			<DownloadSection />
			<EqualizerSection />
			<SquiglinkSection />
			<DescriptionSection />
		</div>
	</div>

	<ExportBar />
</div>
