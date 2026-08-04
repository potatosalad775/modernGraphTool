import React from 'react';
import { useConfigEditor } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function DownloadSection() {
	const { state, dispatch } = useConfigEditor();

	return (
		<AccordionSection
			id="section-download"
			title="Download"
			description="Adds a per-curve download button to the selection list, exporting the curve exactly as displayed — smoothing, normalization, target adjustments and EQ included — as .txt files."
			learnMoreHref="./guide-for-admins/customize-page#download"
			optional
			enabled={state.DOWNLOAD_ENABLED}
			onToggleEnabled={(v) => dispatch({ type: 'SET_FIELD', path: ['DOWNLOAD_ENABLED'], value: v })}
		>
			<div className={styles.ceSectionDescription}>
				Nothing else to configure — toggling this on is enough.
			</div>
		</AccordionSection>
	);
}
