import React, { type ReactNode } from 'react';
import { ConfigEditorProvider } from './ConfigEditorContext';
import ImportPanel from './ImportPanel';
import ExportBar from './ExportBar';

// Sections
import InitialSection from './sections/InitialSection';
import NormalizationSection from './sections/NormalizationSection';
import VisualizationSection from './sections/VisualizationSection';
import InterfaceSection from './sections/InterfaceSection';
import UrlSection from './sections/UrlSection';
import CdnModeSection from './sections/CdnModeSection';
import LanguageSection from './sections/LanguageSection';
import PathSection from './sections/PathSection';
import WatermarkSection from './sections/WatermarkSection';
import TargetManifestSection from './sections/TargetManifestSection';
import MultiSampleSection from './sections/MultiSampleSection';
import HptfSection from './sections/HptfSection';
import TraceStylingSection from './sections/TraceStylingSection';
import TopbarSection from './sections/TopbarSection';
import PreferenceBoundSection from './sections/PreferenceBoundSection';
import TargetCustomizerSection from './sections/TargetCustomizerSection';
import SquiglinkSection from './sections/SquiglinkSection';
import DescriptionSection from './sections/DescriptionSection';

import styles from './ConfigEditor.module.css';

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
	{ id: 'section-multi-sample', label: 'Multi-Sample' },
	{ id: 'section-hptf', label: 'HpTF' },
	{ id: 'section-trace-styling', label: 'Trace Styling' },
	{ id: 'section-topbar', label: 'Topbar' },
	{ id: 'section-preference-bound', label: 'Preference Bound' },
	{ id: 'section-target-customizer', label: 'Target Customizer' },
	{ id: 'section-squiglink', label: 'squig.link' },
	{ id: 'section-description', label: 'Description' }
];

function SectionNav(): ReactNode {
	const scrollTo = (id: string) => {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	return (
		<nav className={styles.ceNav}>
			<ul className={styles.ceNavList}>
				{SECTIONS.map(({ id, label }) => (
					<li
						key={id}
						className={styles.ceNavItem}
						onClick={() => scrollTo(id)}
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter') scrollTo(id);
						}}
					>
						{label}
					</li>
				))}
			</ul>
		</nav>
	);
}

function ConfigEditorInner(): ReactNode {
	return (
		<div className={styles.ceContainer}>
			<ImportPanel />

			<div className={styles.ceLayout}>
				<SectionNav />

				<div className={styles.ceMain}>
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
					<MultiSampleSection />
					<HptfSection />
					<TraceStylingSection />
					<TopbarSection />
					<PreferenceBoundSection />
					<TargetCustomizerSection />
					<SquiglinkSection />
					<DescriptionSection />
				</div>
			</div>

			<ExportBar />
		</div>
	);
}

export default function ConfigEditor(): ReactNode {
	return (
		<ConfigEditorProvider>
			<ConfigEditorInner />
		</ConfigEditorProvider>
	);
}
